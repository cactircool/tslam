/**
 * $lib/server/dump/index.ts
 *
 * Replaces the slackdump CLI approach with direct Slack Web API calls via
 * the official @slack/web-api SDK. Archives are stored as JSON files on disk
 * and served as a simple HTML viewer — no subprocess required.
 */

import { env } from '$env/dynamic/private';
import { WebClient } from '@slack/web-api';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchivedChannel {
	id: string;
	name: string;
	messages: ArchivedMessage[];
}

export interface ArchivedMessage {
	ts: string;
	user: string;
	text: string;
	replies?: ArchivedMessage[];
	files?: { name: string; url_private: string }[];
}

export interface SnapshotArchive {
	createdAt: string;
	teamId: string;
	channels: ArchivedChannel[];
	users: Record<string, { name: string; real_name: string; image?: string }>;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function snapshotDir(username: string, workspace: string) {
	return path.join(env.SNAPSHOT_DIR, username, workspace);
}

function snapshotPath(username: string, workspace: string, label: string) {
	return path.join(snapshotDir(username, workspace), `${label}.json`);
}

// ---------------------------------------------------------------------------
// createSnapshot
//
// Fetches all bot-joined channels and their complete message history (with
// thread replies) from the Slack API and writes a single JSON file to disk.
// Returns the ISO timestamp label used as the filename, or false on failure.
// ---------------------------------------------------------------------------

export async function createSnapshot(
	username: string,
	workspace: string,
	botToken: string
): Promise<string | false> {
	const label = new Date().toISOString();
	const client = new WebClient(botToken);

	try {
		await mkdir(snapshotDir(username, workspace), { recursive: true });

		// ── 1. Fetch users ──────────────────────────────────────────────────
		const usersMap: SnapshotArchive['users'] = {};
		let userCursor: string | undefined;
		do {
			const res = await client.users.list({ cursor: userCursor, limit: 200 });
			for (const u of res.members ?? []) {
				if (u.id) {
					usersMap[u.id] = {
						name: u.name ?? u.id,
						real_name: u.real_name ?? u.name ?? u.id,
						image: u.profile?.image_48
					};
				}
			}
			userCursor = res.response_metadata?.next_cursor || undefined;
		} while (userCursor);

		// ── 2. Fetch channels the bot has joined ────────────────────────────
		const channels: ArchivedChannel[] = [];
		let chanCursor: string | undefined;
		do {
			const res = await client.conversations.list({
				cursor: chanCursor,
				limit: 200,
				types: 'public_channel,private_channel',
				exclude_archived: false
			});
			for (const ch of res.channels ?? []) {
				// Only archive channels where the bot is a member
				if (ch.id && ch.is_member) {
					channels.push({ id: ch.id, name: ch.name ?? ch.id, messages: [] });
				}
			}
			chanCursor = res.response_metadata?.next_cursor || undefined;
		} while (chanCursor);

		// ── 3. Fetch messages + thread replies for each channel ─────────────
		for (const channel of channels) {
			let msgCursor: string | undefined;
			const allMessages: ArchivedMessage[] = [];

			do {
				const res = await client.conversations.history({
					channel: channel.id,
					cursor: msgCursor,
					limit: 200
				});

				for (const msg of res.messages ?? []) {
					if (!msg.ts) continue;
					const archived: ArchivedMessage = {
						ts: msg.ts,
						user: msg.user ?? msg.bot_id ?? 'unknown',
						text: msg.text ?? '',
						files: (msg.files as any[])?.map((f) => ({
							name: f.name ?? '',
							url_private: f.url_private ?? ''
						}))
					};

					// Fetch thread replies if this is a parent message
					if (msg.reply_count && msg.reply_count > 0) {
						const threadRes = await client.conversations.replies({
							channel: channel.id,
							ts: msg.ts,
							limit: 200
						});
						// First message in replies is the parent itself — skip it
						archived.replies = (threadRes.messages ?? []).slice(1).map((r) => ({
							ts: r.ts ?? '',
							user: r.user ?? r.bot_id ?? 'unknown',
							text: r.text ?? ''
						}));
					}

					allMessages.push(archived);
				}

				msgCursor = res.response_metadata?.next_cursor || undefined;
			} while (msgCursor);

			channel.messages = allMessages;
		}

		// ── 4. Write archive to disk ─────────────────────────────────────────
		const archive: SnapshotArchive = {
			createdAt: label,
			teamId: '',
			channels,
			users: usersMap
		};

		await writeFile(snapshotPath(username, workspace, label), JSON.stringify(archive), 'utf-8');
		console.log(`Snapshot saved: ${snapshotPath(username, workspace, label)}`);
		return label;
	} catch (err) {
		console.error('createSnapshot error:', err);
		return false;
	}
}

// ---------------------------------------------------------------------------
// readSnapshot
//
// Reads the JSON archive from disk and returns it. Used by the view endpoint.
// ---------------------------------------------------------------------------

export async function readSnapshot(
	username: string,
	workspace: string,
	label: string
): Promise<SnapshotArchive | null> {
	const p = snapshotPath(username, workspace, label);
	if (!existsSync(p)) return null;
	try {
		const raw = await readFile(p, 'utf-8');
		return JSON.parse(raw) as SnapshotArchive;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// closeSnapshot
//
// Previously killed a subprocess — now a no-op since we serve static JSON.
// Kept for API compatibility.
// ---------------------------------------------------------------------------

export async function closeSnapshot(
	_username: string,
	_workspace: string,
	_label: string
): Promise<void> {
	// Nothing to close — no subprocess is running.
}

// ---------------------------------------------------------------------------
// renderSnapshotHtml
//
// Generates a self-contained HTML page to browse a snapshot archive.
// Respects the viewer's permission flags.
// ---------------------------------------------------------------------------

export function renderSnapshotHtml(
	archive: SnapshotArchive,
	permissions: {
		canViewChannels: boolean;
		canViewDMs: boolean;
		canViewFiles: boolean;
		canViewThreads: boolean;
		canViewUserProfiles: boolean;
	}
): string {
	const channels = permissions.canViewChannels ? archive.channels : [];

	function userName(id: string) {
		if (!permissions.canViewUserProfiles) return id;
		const u = archive.users[id];
		return u ? u.real_name || u.name : id;
	}

	function escHtml(s: string) {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function renderMessages(msgs: ArchivedMessage[], indent = false): string {
		return msgs
			.map((m) => {
				const name = escHtml(userName(m.user));
				const text = escHtml(m.text);
				const time = new Date(parseFloat(m.ts) * 1000).toLocaleString();
				const files =
					permissions.canViewFiles && m.files?.length
						? `<div class="files">${m.files.map((f) => `<span class="file">📎 ${escHtml(f.name)}</span>`).join('')}</div>`
						: '';
				const replies =
					permissions.canViewThreads && m.replies?.length
						? `<div class="replies">${renderMessages(m.replies, true)}</div>`
						: '';
				return `<div class="msg${indent ? ' reply' : ''}">
  <span class="name">${name}</span>
  <span class="time">${time}</span>
  <div class="text">${text}</div>
  ${files}${replies}
</div>`;
			})
			.join('');
	}

	const channelNav = channels
		.map((ch) => `<a href="#ch-${escHtml(ch.id)}">#${escHtml(ch.name)}</a>`)
		.join('');

	const channelBodies = channels
		.map(
			(ch) => `
<section id="ch-${escHtml(ch.id)}">
  <h2>#${escHtml(ch.name)} <span class="count">${ch.messages.length} messages</span></h2>
  <div class="messages">${renderMessages(ch.messages)}</div>
</section>`
		)
		.join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Slack Archive — ${escHtml(new Date(archive.createdAt).toLocaleDateString())}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f0f11;color:#d4d4d8;display:flex;height:100vh;overflow:hidden}
  nav{width:220px;min-width:180px;background:#18181b;border-right:1px solid #27272a;overflow-y:auto;padding:1rem 0;flex-shrink:0}
  nav a{display:block;padding:.4rem 1rem;font-size:.85rem;color:#a1a1aa;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  nav a:hover{background:#27272a;color:#e4e4e7}
  main{flex:1;overflow-y:auto;padding:1.5rem}
  section{margin-bottom:2.5rem}
  h2{font-size:1rem;font-weight:600;color:#e4e4e7;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid #27272a}
  .count{font-size:.75rem;font-weight:400;color:#71717a;margin-left:.5rem}
  .msg{padding:.6rem .75rem;border-radius:.5rem;margin-bottom:.25rem;background:#18181b}
  .msg:hover{background:#1f1f23}
  .reply{margin-left:1.5rem;background:#111113;border-left:2px solid #3f3f46}
  .name{font-weight:600;font-size:.8rem;color:#a78bfa;margin-right:.5rem}
  .time{font-size:.7rem;color:#52525b}
  .text{font-size:.85rem;color:#d4d4d8;margin-top:.25rem;white-space:pre-wrap;word-break:break-word}
  .replies{margin-top:.5rem}
  .files{margin-top:.35rem}
  .file{font-size:.75rem;color:#60a5fa;margin-right:.5rem}
  .empty{color:#52525b;font-size:.85rem;padding:2rem;text-align:center}
</style>
</head>
<body>
<nav>${channelNav || '<p class="empty">No channels</p>'}</nav>
<main>
${channelBodies || '<p class="empty">No content available.</p>'}
</main>
</body>
</html>`;
}
