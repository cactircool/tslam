/**
 * src/routes/api/view/[username]/[workspace]/snapshot/+server.ts
 *
 * Replaces the old proxy-to-slackdump-subprocess approach.
 * Reads the JSON archive from disk and renders it as a self-contained HTML page.
 * Respects the requesting user's permission flags.
 */

import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import {
	snapshot,
	workspace,
	workspace_member,
	workspace_member_permission,
	user
} from '$lib/server/db/schema';
import { readSnapshot, renderSnapshotHtml } from '$lib/server/dump';
import { eq, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, url, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) error(401);

	// The snapshot id comes as a query param: ?id=42
	// (keeping the URL structure compatible with the existing iframe src)
	const snapshotId = Number(url.searchParams.get('id') ?? params.snapshot);
	console.log(params, url.searchParams, snapshotId);
	if (!snapshotId) error(400, 'Missing snapshot id');

	const userId = session.user.id;

	// Load snapshot + workspace
	const [row] = await db
		.select({ snap: snapshot, ws: workspace })
		.from(snapshot)
		.innerJoin(workspace, eq(snapshot.workspace, workspace.id))
		.where(eq(snapshot.id, snapshotId));

	if (!row) error(404);

	const isAdmin = row.ws.admin === userId;

	// Check membership
	const [membership] = isAdmin
		? [true as const]
		: await db
				.select()
				.from(workspace_member)
				.where(and(eq(workspace_member.workspace, row.ws.id), eq(workspace_member.member, userId)));

	if (!isAdmin && !membership) error(403);

	// Load permissions (admins get everything)
	let perms = {
		canViewChannels: true,
		canViewDMs: false,
		canViewFiles: true,
		canViewThreads: true,
		canViewUserProfiles: true
	};

	if (!isAdmin) {
		const [p] = await db
			.select()
			.from(workspace_member_permission)
			.where(
				and(
					eq(workspace_member_permission.workspace, row.ws.id),
					eq(workspace_member_permission.member, userId)
				)
			);
		if (p) {
			perms = {
				canViewChannels: p.canViewChannels,
				canViewDMs: p.canViewDMs,
				canViewFiles: p.canViewFiles,
				canViewThreads: p.canViewThreads,
				canViewUserProfiles: p.canViewUserProfiles
			};
		}
	}

	// Resolve the admin's username to find the archive on disk
	const [adminUser] = await db
		.select({ username: user.username })
		.from(user)
		.where(eq(user.id, row.ws.admin));

	if (!adminUser) error(500, 'Admin not found');

	const archive = await readSnapshot(adminUser.username, row.ws.name, row.snap.label!);
	if (!archive) error(404, 'Snapshot archive not found on disk');

	const html = renderSnapshotHtml(archive, perms);

	return new Response(html, {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};
