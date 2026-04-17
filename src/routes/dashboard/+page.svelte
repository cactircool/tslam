<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';

	const { data } = $props();

	// ─── Navigation ────────────────────────────────────────────────────────────
	let view = $state<'home' | 'search' | 'admin' | 'workspace'>('home');
	let activeWorkspace = $state<any>(null);
	let activeSnapshot = $state<any>(null);

	// ─── Search ────────────────────────────────────────────────────────────────
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let searching = $state(false);
	let searchError = $state('');

	// ─── New workspace form ────────────────────────────────────────────────────
	let showNewWsForm = $state(false);
	let newName = $state('');
	let newBotToken = $state('');
	let newWsError = $state('');

	// ─── Admin panel state (all keyed by workspace id) ─────────────────────────
	let adminTab = $state<Record<number, string>>({});
	let openPermMember = $state<Record<string, boolean>>({});
	let editingCreds = $state<Record<number, boolean>>({});
	let savedFlash = $state<Record<number, boolean>>({});
	let snapshottingWs = $state<Record<number, boolean>>({});

	// ─── Schedule state per workspace ─────────────────────────────────────────
	let scheduleState = $state<Record<number, any>>({});

	// ─── Permission edits keyed `${wsId}:${memberId}` ─────────────────────────
	let permEditMap = $state<Record<string, any>>({});

	// ─── Snapshots for active workspace ───────────────────────────────────────
	let workspaceSnapshots = $state<any[]>([]);
	let loadingSnapshots = $state(false);

	// ─── Derived ───────────────────────────────────────────────────────────────
	const allWorkspaces = $derived([
		...data.adminWorkspaces.map((w: any) => ({
			...w,
			role: 'admin',
			adminUsername: data.user.username
		})),
		...data.memberWorkspaces.map((w: any) => ({ ...w, role: 'member' }))
	]);

	const pendingCount = $derived(data.incomingRequests.length);

	// ─── Helpers ───────────────────────────────────────────────────────────────
	function getTab(wsId: number) {
		return adminTab[wsId] ?? 'requests';
	}

	function flash(wsId: number) {
		savedFlash = { ...savedFlash, [wsId]: true };
		setTimeout(() => {
			savedFlash = { ...savedFlash, [wsId]: false };
		}, 2500);
	}

	function getMembersForWs(wsId: number) {
		return data.membersWithPerms.filter((m: any) => m.workspaceId === wsId);
	}

	// ─── Schedule helpers ──────────────────────────────────────────────────────
	function getSchedule(wsId: number) {
		if (scheduleState[wsId]) return scheduleState[wsId];
		const existing = data.schedules.find((s: any) => s.workspace === wsId);
		if (existing) {
			return {
				years: 0,
				months: 0,
				days: existing.intervalDays,
				hours: 0,
				minutes: 0,
				enabled: existing.enabled
			};
		}
		return { years: 0, months: 0, days: 30, hours: 0, minutes: 0, enabled: false };
	}

	function setScheduleField(wsId: number, field: string, value: string) {
		const cur = getSchedule(wsId);
		scheduleState[wsId] = { ...cur, [field]: Math.max(0, Number(value) || 0) };
	}

	function scheduleToIntervalDays(s: any) {
		return s.years * 365 + s.months * 30 + s.days + s.hours / 24 + s.minutes / 1440;
	}

	function scheduleLabel(s: any) {
		const parts: string[] = [];
		if (s.years) parts.push(`${s.years}y`);
		if (s.months) parts.push(`${s.months}mo`);
		if (s.days) parts.push(`${s.days}d`);
		if (s.hours) parts.push(`${s.hours}h`);
		if (s.minutes) parts.push(`${s.minutes}m`);
		return parts.length ? `Every ${parts.join(' ')}` : 'No interval set';
	}

	const SCHEDULE_PRESETS = [
		{ label: 'Daily', v: { years: 0, months: 0, days: 1, hours: 0, minutes: 0 } },
		{ label: 'Weekly', v: { years: 0, months: 0, days: 7, hours: 0, minutes: 0 } },
		{ label: 'Monthly', v: { years: 0, months: 1, days: 0, hours: 0, minutes: 0 } },
		{ label: 'Quarterly', v: { years: 0, months: 3, days: 0, hours: 0, minutes: 0 } },
		{ label: 'Yearly', v: { years: 1, months: 0, days: 0, hours: 0, minutes: 0 } }
	];

	// ─── Permission helpers ────────────────────────────────────────────────────
	const PERMS = [
		{ key: 'canViewChannels', label: 'View channels', desc: 'Public channel messages' },
		{ key: 'canViewDMs', label: 'View DMs', desc: 'Direct message threads' },
		{ key: 'canViewFiles', label: 'View files', desc: 'Download & preview files' },
		{ key: 'canViewThreads', label: 'View threads', desc: 'Threaded replies' },
		{ key: 'canViewUserProfiles', label: 'View profiles', desc: 'Names and avatars' },
		{ key: 'canExport', label: 'Export data', desc: 'Download archives' }
	];

	function initPerms(perm: any) {
		return {
			canViewChannels: perm?.canViewChannels ?? true,
			canViewDMs: perm?.canViewDMs ?? false,
			canViewFiles: perm?.canViewFiles ?? true,
			canViewThreads: perm?.canViewThreads ?? true,
			canViewUserProfiles: perm?.canViewUserProfiles ?? true,
			canExport: perm?.canExport ?? false
		};
	}

	function getPermEdit(wsId: number, memberId: string, perm: any) {
		const key = `${wsId}:${memberId}`;
		if (!permEditMap[key]) permEditMap = { ...permEditMap, [key]: initPerms(perm) };
		return permEditMap[key];
	}

	function setPermField(wsId: number, memberId: string, field: string, value: boolean) {
		const key = `${wsId}:${memberId}`;
		const cur = permEditMap[key] ?? initPerms(null);
		permEditMap = { ...permEditMap, [key]: { ...cur, [field]: value } };
	}

	// ─── Navigation ────────────────────────────────────────────────────────────
	function navTo(v: typeof view) {
		closeActiveSnapshot().then(() => {
			view = v;
			activeWorkspace = null;
		});
	}

	function openWorkspace(ws: any) {
		activeWorkspace = ws;
		activeSnapshot = null;
		view = 'workspace';
	}

	async function closeActiveSnapshot() {
		if (!activeSnapshot) return;
		await fetch('/api/close-snapshot', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ snapshotId: activeSnapshot.id })
		});
		activeSnapshot = null;
	}

	async function searchAdmin() {
		if (!searchQuery.trim()) return;
		searching = true;
		searchError = '';
		searchResults = [];
		const res = await fetch(`/api/search-workspaces?q=${encodeURIComponent(searchQuery)}`);
		const json = await res.json();
		searching = false;
		if (json.error) searchError = json.error;
		else searchResults = json.results;
	}

	async function signOut() {
		await authClient.signOut();
		goto('/login');
	}

	// ─── Load snapshots when entering workspace view ───────────────────────────
	$effect(() => {
		if (view === 'workspace' && activeWorkspace) {
			loadingSnapshots = true;
			workspaceSnapshots = [];
			fetch(`/api/workspaces/${activeWorkspace.id}/snapshots`)
				.then((r) => r.json())
				.then((d) => {
					workspaceSnapshots = d.snapshots ?? [];
					loadingSnapshots = false;
				});
		}
	});
</script>

<div class="min-h-svh bg-zinc-950 text-zinc-100">
	<!-- Background grid -->
	<div
		class="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:48px_48px]"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none fixed top-0 left-1/2 h-[360px] w-[900px] -translate-x-1/2 rounded-full bg-violet-600/8 blur-[140px]"
		aria-hidden="true"
	></div>

	<!-- ══════════════════════ TOPBAR ══════════════════════ -->
	<header
		class="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/85 px-6 py-3 backdrop-blur-md"
	>
		<div class="flex items-center gap-6">
			<!-- Wordmark -->
			<div class="flex items-center gap-2.5">
				<svg
					width="18"
					height="18"
					viewBox="0 0 18 18"
					fill="none"
					aria-hidden="true"
					class="text-violet-400"
				>
					<rect x="1" y="1" width="7" height="7" rx="1.5" fill="currentColor" />
					<rect x="10" y="1" width="7" height="7" rx="1.5" fill="currentColor" opacity=".45" />
					<rect x="1" y="10" width="7" height="7" rx="1.5" fill="currentColor" opacity=".45" />
					<rect x="10" y="10" width="7" height="7" rx="1.5" fill="currentColor" opacity=".15" />
				</svg>
				<span class="text-sm font-semibold tracking-tight">SlackVault</span>
			</div>
			<!-- Nav -->
			<nav class="flex items-center gap-0.5">
				{#each [['home', 'Workspaces'], ['search', 'Find & Join'], ['admin', 'Admin']] as const as [v, label]}
					<button
						onclick={() => navTo(v)}
						class="relative rounded-lg px-3 py-1.5 text-sm transition-all {view === v ||
						(v === 'home' && view === 'workspace')
							? 'bg-zinc-800 text-zinc-100'
							: 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'}"
					>
						{label}
						{#if v === 'admin' && pendingCount > 0}
							<span
								class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white"
								>{pendingCount}</span
							>
						{/if}
					</button>
				{/each}
			</nav>
		</div>
		<div class="flex items-center gap-3">
			<span class="text-xs text-zinc-500">@{data.user.username ?? data.user.name}</span>
			<button
				onclick={signOut}
				class="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200"
			>
				Sign out
			</button>
		</div>
	</header>

	<main class="relative mx-auto w-full max-w-5xl flex-1 px-6 py-8">
		<!-- ══════════════════════════════════════════════════════
		     HOME — workspace list
		══════════════════════════════════════════════════════ -->
		{#if view === 'home'}
			<div class="mb-8 flex items-center justify-between">
				<div>
					<h2 class="text-xl font-semibold">Your workspaces</h2>
					<p class="mt-0.5 text-sm text-zinc-500">All Slack archives you have access to</p>
				</div>
				<button
					onclick={() => {
						showNewWsForm = !showNewWsForm;
						newWsError = '';
					}}
					class="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-violet-500"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 4v16m8-8H4"
						/></svg
					>
					New workspace
				</button>
			</div>

			<!-- New workspace form -->
			{#if showNewWsForm}
				<div class="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
					<h3 class="mb-1 text-sm font-semibold text-zinc-200">Connect a Slack workspace</h3>
					<p class="mb-4 text-xs text-zinc-500">
						You'll need a Slack bot token (<code
							class="rounded bg-zinc-800 px-1 py-0.5 font-mono text-zinc-400">xoxb-…</code
						>).
						<a
							href="https://api.slack.com/apps"
							target="_blank"
							rel="noopener"
							class="text-violet-400 underline underline-offset-2 hover:text-violet-300"
							>Create one at api.slack.com/apps →</a
						>
					</p>

					{#if newWsError}
						<div
							class="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
						>
							{newWsError}
						</div>
					{/if}

					<form
						method="POST"
						action="?/createWorkspace"
						use:enhance={() => {
							newWsError = '';
							return ({ result, update }) => {
								if (result.type === 'success' && (result.data as any)?.error) {
									newWsError = (result.data as any).error;
								} else {
									showNewWsForm = false;
									newName = '';
									newBotToken = '';
									update();
								}
							};
						}}
					>
						<div class="mb-4 space-y-3">
							<div class="space-y-1.5">
								<label class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
									>Workspace name</label
								>
								<input
									type="text"
									name="name"
									bind:value={newName}
									placeholder="e.g. Acme Engineering"
									autocomplete="off"
									class="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20"
								/>
								<p class="text-xs text-zinc-600">Unique display name across your workspaces.</p>
							</div>
							<div class="space-y-1.5">
								<label class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
									>Bot token</label
								>
								<input
									type="password"
									name="botToken"
									bind:value={newBotToken}
									placeholder="xoxb-…"
									autocomplete="off"
									class="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20"
								/>
								<p class="text-xs text-zinc-600">
									Bot User OAuth Token from your Slack app. Needs scopes:
									<code class="text-zinc-500">channels:history</code>,
									<code class="text-zinc-500">channels:read</code>,
									<code class="text-zinc-500">users:read</code>. Invite the bot to each channel you
									want archived.
								</p>
							</div>
						</div>
						<div class="flex justify-end gap-2">
							<button
								type="button"
								onclick={() => {
									showNewWsForm = false;
									newWsError = '';
								}}
								class="px-4 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
								>Cancel</button
							>
							<button
								type="submit"
								disabled={!newName.trim() || !newBotToken.trim()}
								class="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
								>Add workspace</button
							>
						</div>
					</form>
				</div>
			{/if}

			<!-- Workspace grid -->
			{#if allWorkspaces.length === 0}
				<div class="py-24 text-center text-zinc-600">
					<div class="mb-3 text-4xl">📦</div>
					<p class="text-sm">No workspaces yet.</p>
					<p class="mt-1 text-xs text-zinc-700">
						Create one above, or
						<button
							onclick={() => (view = 'search')}
							class="text-violet-500 underline underline-offset-2 hover:text-violet-400"
							>find one to join</button
						>.
					</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each allWorkspaces as ws}
						<button
							onclick={() => openWorkspace(ws)}
							class="group rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800/80"
						>
							<div class="mb-4 flex items-start justify-between">
								<div
									class="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10"
								>
									<svg
										class="h-5 w-5 text-violet-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1.5"
											d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
										/></svg
									>
								</div>
								<span
									class="rounded-full px-2 py-0.5 text-[11px] font-medium {ws.role === 'admin'
										? 'border border-violet-500/20 bg-violet-500/10 text-violet-400'
										: 'border border-zinc-700 bg-zinc-800 text-zinc-400'}"
								>
									{ws.role}
								</span>
							</div>
							<p class="mb-1 text-sm font-semibold text-zinc-200">{ws.name}</p>
							{#if ws.role === 'member'}
								<p class="text-xs text-zinc-600">admin: @{ws.adminUsername}</p>
							{/if}
							<div
								class="mt-4 flex items-center gap-1 text-xs text-zinc-600 transition-colors group-hover:text-zinc-400"
							>
								View snapshots
								<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5l7 7-7 7"
									/></svg
								>
							</div>
						</button>
					{/each}
				</div>
			{/if}

			<!-- ══════════════════════════════════════════════════════
		     SEARCH — find & join workspaces
		══════════════════════════════════════════════════════ -->
		{:else if view === 'search'}
			<div class="mx-auto max-w-xl">
				<div class="mb-8">
					<h2 class="text-xl font-semibold">Find a workspace</h2>
					<p class="mt-0.5 text-sm text-zinc-500">Search by admin username to request access</p>
				</div>
				<div class="flex gap-2">
					<input
						type="text"
						bind:value={searchQuery}
						onkeydown={(e) => e.key === 'Enter' && searchAdmin()}
						placeholder="Enter admin username…"
						class="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20"
					/>
					<button
						onclick={searchAdmin}
						disabled={searching || !searchQuery.trim()}
						class="rounded-xl bg-violet-600 px-5 py-3 text-sm font-medium text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
					>
						{searching ? '…' : 'Search'}
					</button>
				</div>

				{#if searchError}<p class="mt-3 text-sm text-red-400">{searchError}</p>{/if}

				{#if searchResults.length > 0}
					<div class="mt-6 space-y-3">
						{#each searchResults as result}
							{@const alreadyMember =
								data.adminWorkspaces.find((w: any) => w.id === result.id) ||
								data.memberWorkspaces.find((w: any) => w.id === result.id)}
							{@const pendingReq = data.myRequests.find(
								(r: any) => r.request.workspace === result.id && r.request.status === 'pending'
							)}
							<div
								class="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4"
							>
								<div>
									<p class="text-sm font-semibold text-zinc-200">{result.name}</p>
									<p class="mt-0.5 text-xs text-zinc-500">admin: @{result.adminUsername}</p>
								</div>
								{#if alreadyMember}
									<span
										class="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400"
										>Joined</span
									>
								{:else if pendingReq}
									<span
										class="shrink-0 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-500"
										>Requested</span
									>
								{:else}
									<form method="POST" action="?/requestToJoin" use:enhance>
										<input type="hidden" name="workspaceId" value={result.id} />
										<button
											type="submit"
											class="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-violet-500"
										>
											Request access
										</button>
									</form>
								{/if}
							</div>
						{/each}
					</div>
				{:else if !searching && searchQuery && !searchError}
					<p class="mt-8 text-center text-sm text-zinc-600">
						No workspaces found for "@{searchQuery}".
					</p>
				{/if}

				{#if data.myRequests.filter((r: any) => r.request.status === 'pending').length > 0}
					<div class="mt-10">
						<h3 class="mb-3 text-xs font-medium tracking-wider text-zinc-500 uppercase">
							Pending requests
						</h3>
						<div class="space-y-2">
							{#each data.myRequests.filter((r: any) => r.request.status === 'pending') as { request: req, workspaceName }}
								<div
									class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
								>
									<span class="text-sm text-zinc-300">{workspaceName}</span>
									<span
										class="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
										>Pending</span
									>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- ══════════════════════════════════════════════════════
		     ADMIN — manage owned workspaces
		══════════════════════════════════════════════════════ -->
		{:else if view === 'admin'}
			<div class="mb-8">
				<h2 class="text-xl font-semibold">Admin panel</h2>
				<p class="mt-0.5 text-sm text-zinc-500">
					Manage members, permissions, credentials, and schedules
				</p>
			</div>

			{#if data.adminWorkspaces.length === 0}
				<div class="py-20 text-center text-zinc-600">
					<p class="text-sm">You don't own any workspaces yet.</p>
					<button
						onclick={() => {
							view = 'home';
							showNewWsForm = true;
						}}
						class="mt-3 text-sm text-violet-400 transition-colors hover:text-violet-300"
						>Create one →</button
					>
				</div>
			{:else}
				<div class="space-y-6">
					{#each data.adminWorkspaces as ws}
						{@const members = getMembersForWs(ws.id)}
						{@const wsRequests = data.incomingRequests.filter((r: any) => r.workspaceId === ws.id)}
						{@const tab = getTab(ws.id)}
						{@const sched = getSchedule(ws.id)}
						{@const existingSched = data.schedules.find((s: any) => s.workspace === ws.id)}

						<div class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
							<!-- Workspace header -->
							<div class="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
								<div class="flex items-center gap-3">
									<div
										class="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10"
									>
										<svg
											class="h-4 w-4 text-violet-400"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
											><path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="1.5"
												d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
											/></svg
										>
									</div>
									<div>
										<p class="text-sm font-semibold text-zinc-200">{ws.name}</p>
										<p class="text-xs text-zinc-600">
											#{ws.id} · {members.length} member{members.length !== 1 ? 's' : ''}
										</p>
									</div>
								</div>
								<div class="flex items-center gap-3">
									{#if wsRequests.length > 0}
										<span
											class="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
											>{wsRequests.length} pending</span
										>
									{/if}
									{#if savedFlash[ws.id]}
										<span class="flex items-center gap-1 text-xs text-emerald-400">
											<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"
												><path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2.5"
													d="M5 13l4 4L19 7"
												/></svg
											>
											Saved
										</span>
									{/if}
								</div>
							</div>

							<!-- Tab bar -->
							<div class="flex border-b border-zinc-800 bg-zinc-950/30">
								{#each [['requests', 'Requests', wsRequests.length], ['members', 'Members', members.length], ['settings', 'Settings', 0]] as const as [t, label, count]}
									<button
										onclick={() => (adminTab = { ...adminTab, [ws.id]: t })}
										class="-mb-px flex items-center gap-1.5 border-b-2 px-5 py-2.5 text-xs font-medium transition-all {tab ===
										t
											? 'border-violet-500 text-violet-400'
											: 'border-transparent text-zinc-500 hover:text-zinc-300'}"
									>
										{label}
										{#if count > 0}
											<span
												class="rounded-full px-1.5 py-0.5 text-[10px] font-bold {t === 'requests'
													? 'bg-amber-500/15 text-amber-400'
													: 'bg-zinc-800 text-zinc-400'}">{count}</span
											>
										{/if}
									</button>
								{/each}
							</div>

							<!-- ── REQUESTS TAB ── -->
							{#if tab === 'requests'}
								{#if wsRequests.length === 0}
									<div class="px-5 py-8 text-center text-sm text-zinc-600">
										No pending join requests.
									</div>
								{:else}
									<div class="divide-y divide-zinc-800/50">
										{#each wsRequests as { request, requesterUsername, requesterName }}
											<div class="flex items-center justify-between px-5 py-3.5">
												<div class="flex items-center gap-3">
													<div
														class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-medium text-zinc-300"
													>
														{requesterName?.charAt(0).toUpperCase() ?? '?'}
													</div>
													<div>
														<p class="text-sm font-medium text-zinc-200">@{requesterUsername}</p>
														<p class="text-xs text-zinc-500">{requesterName}</p>
													</div>
												</div>
												<div class="flex gap-2">
													<form method="POST" action="?/respondToRequest" use:enhance>
														<input type="hidden" name="requestId" value={request.id} />
														<input type="hidden" name="action" value="denied" />
														<button
															type="submit"
															class="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-all hover:border-red-500/30 hover:text-red-400"
															>Deny</button
														>
													</form>
													<form method="POST" action="?/respondToRequest" use:enhance>
														<input type="hidden" name="requestId" value={request.id} />
														<input type="hidden" name="action" value="approved" />
														<button
															type="submit"
															class="rounded-lg border border-emerald-500/30 bg-emerald-600/20 px-3 py-1.5 text-xs text-emerald-400 transition-all hover:bg-emerald-600/30"
															>Approve</button
														>
													</form>
												</div>
											</div>
										{/each}
									</div>
								{/if}

								<!-- ── MEMBERS TAB ── -->
							{:else if tab === 'members'}
								{#if members.length === 0}
									<div class="px-5 py-8 text-center text-sm text-zinc-600">
										No members yet. Approve join requests to add members.
									</div>
								{:else}
									<div class="divide-y divide-zinc-800/50">
										{#each members as m (m.memberId)}
											{@const permKey = `${ws.id}:${m.memberId}`}
											{@const isOpen = !!openPermMember[permKey]}
											{@const edit = getPermEdit(ws.id, m.memberId, m.perm)}
											<div>
												<div class="flex items-center justify-between px-5 py-3.5">
													<div class="flex items-center gap-3">
														<div
															class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-300"
														>
															{m.memberName?.charAt(0).toUpperCase() ?? '?'}
														</div>
														<div>
															<p class="text-sm font-medium text-zinc-200">@{m.memberUsername}</p>
															<p class="text-xs text-zinc-500">{m.memberName}</p>
														</div>
													</div>
													<div class="flex items-center gap-2">
														<button
															onclick={() => {
																openPermMember = { ...openPermMember, [permKey]: !isOpen };
															}}
															class="rounded-lg border px-3 py-1.5 text-xs transition-all {isOpen
																? 'border-violet-500/40 bg-violet-500/10 text-violet-400'
																: 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}"
															>{isOpen ? 'Close' : 'Permissions'}</button
														>
														<form method="POST" action="?/removeMember" use:enhance>
															<input type="hidden" name="workspaceId" value={ws.id} />
															<input type="hidden" name="memberId" value={m.memberId} />
															<button
																type="submit"
																class="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-500 transition-all hover:border-red-500/30 hover:text-red-400"
																>Remove</button
															>
														</form>
													</div>
												</div>

												{#if isOpen}
													<div
														class="mx-4 mb-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60"
													>
														<div
															class="flex items-center justify-between border-b border-zinc-800 px-4 py-3"
														>
															<p class="text-xs font-medium tracking-wider text-zinc-400 uppercase">
																Snapshot access
															</p>
															<p class="text-xs text-zinc-600">
																Changes apply on next snapshot view
															</p>
														</div>
														<div class="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
															{#each PERMS as perm}
																{@const checked = edit[perm.key]}
																<button
																	type="button"
																	onclick={() =>
																		setPermField(ws.id, m.memberId, perm.key, !checked)}
																	class="flex items-center gap-3 rounded-xl border p-3 text-left transition-all {checked
																		? 'border-violet-500/30 bg-violet-500/5'
																		: 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}"
																>
																	<div
																		class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all {checked
																			? 'border-violet-600 bg-violet-600'
																			: 'border-zinc-600'}"
																	>
																		{#if checked}
																			<svg
																				class="h-2.5 w-2.5 text-white"
																				fill="none"
																				stroke="currentColor"
																				viewBox="0 0 24 24"
																				><path
																					stroke-linecap="round"
																					stroke-linejoin="round"
																					stroke-width="3"
																					d="M5 13l4 4L19 7"
																				/></svg
																			>
																		{/if}
																	</div>
																	<div>
																		<p
																			class="text-xs font-medium {checked
																				? 'text-zinc-200'
																				: 'text-zinc-400'}"
																		>
																			{perm.label}
																		</p>
																		<p class="mt-0.5 text-[11px] text-zinc-600">{perm.desc}</p>
																	</div>
																</button>
															{/each}
														</div>
														<div class="px-4 pb-4">
															<form
																method="POST"
																action="?/updatePermissions"
																use:enhance={() => {
																	return ({ update }) => {
																		openPermMember = { ...openPermMember, [permKey]: false };
																		flash(ws.id);
																		update();
																	};
																}}
															>
																<input type="hidden" name="workspaceId" value={ws.id} />
																<input type="hidden" name="memberId" value={m.memberId} />
																{#each PERMS as perm}
																	<input
																		type="hidden"
																		name={perm.key}
																		value={String(edit[perm.key])}
																	/>
																{/each}
																<button
																	type="submit"
																	class="w-full rounded-lg bg-violet-600 py-2 text-xs font-medium text-white transition-all hover:bg-violet-500"
																>
																	Save permissions
																</button>
															</form>
														</div>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}

								<!-- ── SETTINGS TAB ── -->
							{:else if tab === 'settings'}
								<div class="divide-y divide-zinc-800/50">
									<!-- Credentials -->
									<div class="p-5">
										<div class="mb-4 flex items-start justify-between">
											<div>
												<p class="text-sm font-semibold text-zinc-200">Credentials</p>
												<p class="mt-0.5 text-xs text-zinc-500">
													Bot token used for archiving this workspace
												</p>
											</div>
											<button
												onclick={() =>
													(editingCreds = { ...editingCreds, [ws.id]: !editingCreds[ws.id] })}
												class="shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-all {editingCreds[
													ws.id
												]
													? 'border-zinc-600 bg-zinc-800 text-zinc-300'
													: 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}"
												>{editingCreds[ws.id] ? 'Cancel' : 'Edit'}</button
											>
										</div>

										{#if editingCreds[ws.id]}
											<form
												method="POST"
												action="?/updateWorkspace"
												use:enhance={() => {
													return ({ update }) => {
														editingCreds = { ...editingCreds, [ws.id]: false };
														flash(ws.id);
														update();
													};
												}}
											>
												<input type="hidden" name="workspaceId" value={ws.id} />
												<div class="mb-4 space-y-3">
													<div class="space-y-1.5">
														<label
															class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
															>Name</label
														>
														<input
															type="text"
															name="name"
															placeholder={ws.name}
															class="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 transition-all outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20"
														/>
													</div>
													<div class="space-y-1.5">
														<label
															class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
															>Bot token</label
														>
														<input
															type="password"
															name="botToken"
															placeholder="Leave blank to keep current"
															class="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20"
														/>
													</div>
												</div>
												<button
													type="submit"
													class="rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-violet-500"
												>
													Save
												</button>
											</form>
										{:else}
											<div class="space-y-2">
												<div
													class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
												>
													<span class="w-20 shrink-0 text-xs text-zinc-600">Name</span>
													<span class="text-xs text-zinc-400">{ws.name}</span>
												</div>
												<div
													class="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3"
												>
													<span class="w-20 shrink-0 text-xs text-zinc-600">Bot token</span>
													<span class="font-mono text-xs tracking-widest text-zinc-600"
														>••••••••••••••••</span
													>
												</div>
											</div>
										{/if}
									</div>

									<!-- Schedule -->
									<div class="p-5">
										<div class="mb-4 flex items-start justify-between">
											<div>
												<p class="text-sm font-semibold text-zinc-200">Snapshot schedule</p>
												<p class="mt-0.5 text-xs text-zinc-500">
													{#if existingSched?.enabled}
														<span class="text-emerald-400">Active</span> · Next: {new Date(
															existingSched.nextRun
														).toLocaleDateString()}
														{#if existingSched.lastRun}
															· Last: {new Date(existingSched.lastRun).toLocaleDateString()}{/if}
													{:else if existingSched}
														<span class="text-zinc-600">Paused</span>
													{:else}
														Not configured
													{/if}
												</p>
											</div>
											<!-- Enabled toggle -->
											<button
												type="button"
												onclick={() => {
													const cur = getSchedule(ws.id);
													scheduleState = {
														...scheduleState,
														[ws.id]: { ...cur, enabled: !cur.enabled }
													};
												}}
												class="relative h-6 w-11 shrink-0 rounded-full transition-colors {sched.enabled
													? 'bg-violet-600'
													: 'bg-zinc-700'}"
												aria-label="Toggle schedule"
											>
												<span
													class="absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform {sched.enabled
														? 'translate-x-5'
														: ''}"
												></span>
											</button>
										</div>

										<form
											method="POST"
											action="?/upsertSchedule"
											use:enhance={() => {
												return ({ update }) => {
													flash(ws.id);
													update();
												};
											}}
										>
											<input type="hidden" name="workspaceId" value={ws.id} />
											<input type="hidden" name="enabled" value={String(sched.enabled)} />
											<input
												type="hidden"
												name="intervalDays"
												value={String(scheduleToIntervalDays(sched))}
											/>

											<!-- Time inputs -->
											<div class="mb-4">
												<div class="grid grid-cols-5 gap-2">
													{#each [['years', 'Yrs'], ['months', 'Mo'], ['days', 'Days'], ['hours', 'Hrs'], ['minutes', 'Min']] as const as [field, label]}
														<div class="space-y-1">
															<label
																class="block text-center text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
																>{label}</label
															>
															<input
																type="number"
																min="0"
																value={sched[field]}
																oninput={(e) =>
																	setScheduleField(
																		ws.id,
																		field,
																		(e.target as HTMLInputElement).value
																	)}
																class="w-full [appearance:textfield] rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-2.5 text-center text-sm text-zinc-100 tabular-nums transition-all outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
															/>
														</div>
													{/each}
												</div>
												<p class="mt-2 text-center text-xs text-zinc-600">
													{#if scheduleToIntervalDays(sched) > 0}{scheduleLabel(sched)}{:else}Enter
														at least one value above{/if}
												</p>
											</div>

											<!-- Presets -->
											<div class="mb-4 flex flex-wrap gap-1.5">
												{#each SCHEDULE_PRESETS as preset}
													{@const active =
														JSON.stringify({
															years: sched.years,
															months: sched.months,
															days: sched.days,
															hours: sched.hours,
															minutes: sched.minutes
														}) === JSON.stringify(preset.v)}
													<button
														type="button"
														onclick={() =>
															(scheduleState = {
																...scheduleState,
																[ws.id]: { ...sched, ...preset.v }
															})}
														class="rounded-lg border px-3 py-1.5 text-xs transition-all {active
															? 'border-violet-500/40 bg-violet-500/10 text-violet-400'
															: 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}"
														>{preset.label}</button
													>
												{/each}
											</div>

											<button
												type="submit"
												disabled={scheduleToIntervalDays(sched) <= 0}
												class="rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
												>Save schedule</button
											>
										</form>
									</div>

									<!-- Take snapshot now -->
									<div class="p-5">
										<div class="flex items-start justify-between">
											<div>
												<p class="text-sm font-semibold text-zinc-200">Take snapshot now</p>
												<p class="mt-0.5 text-xs text-zinc-500">
													Immediately capture the current state of this workspace
												</p>
											</div>
											<form
												method="POST"
												action="?/takeSnapshot"
												use:enhance={() => {
													snapshottingWs = { ...snapshottingWs, [ws.id]: true };
													return ({ update }) => {
														snapshottingWs = { ...snapshottingWs, [ws.id]: false };
														flash(ws.id);
														update();
													};
												}}
											>
												<input type="hidden" name="workspaceId" value={ws.id} />
												<button
													type="submit"
													disabled={snapshottingWs[ws.id]}
													class="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-600 hover:bg-zinc-700 disabled:cursor-wait disabled:opacity-50"
												>
													{#if snapshottingWs[ws.id]}
														<svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"
															><circle
																class="opacity-25"
																cx="12"
																cy="12"
																r="10"
																stroke="currentColor"
																stroke-width="4"
															/><path
																class="opacity-75"
																fill="currentColor"
																d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
															/></svg
														>
														Running…
													{:else}
														<svg
															class="h-3.5 w-3.5"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
															><path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
															/><path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width="2"
																d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
															/></svg
														>
														Snapshot now
													{/if}
												</button>
											</form>
										</div>
									</div>
								</div>
								<!-- /settings -->
							{/if}<!-- /tab -->
						</div>
						<!-- /workspace card -->
					{/each}
				</div>
			{/if}

			<!-- ══════════════════════════════════════════════════════
		     WORKSPACE DETAIL — snapshots list + viewer
		══════════════════════════════════════════════════════ -->
		{:else if view === 'workspace' && activeWorkspace}
			<!-- Back + title -->
			<div class="mb-6 flex items-center gap-3">
				<button
					onclick={() => {
						closeActiveSnapshot().then(() => {
							view = 'home';
							activeWorkspace = null;
						});
					}}
					class="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition-all hover:border-zinc-700 hover:text-zinc-300"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 19l-7-7 7-7"
						/></svg
					>
				</button>
				<div>
					<h2 class="text-xl font-semibold text-zinc-100">{activeWorkspace.name}</h2>
					{#if activeWorkspace.role === 'member'}
						<p class="mt-0.5 text-xs text-zinc-600">admin: @{activeWorkspace.adminUsername}</p>
					{/if}
				</div>
			</div>

			{#if activeSnapshot}
				<!-- Breadcrumb -->
				<div class="mb-4 flex items-center gap-2 text-xs text-zinc-500">
					<button
						onclick={closeActiveSnapshot}
						class="flex items-center gap-1 transition-colors hover:text-zinc-300"
					>
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 19l-7-7 7-7"
							/></svg
						>
						Snapshots
					</button>
					<span class="text-zinc-700">/</span>
					<span class="text-zinc-400"
						>{activeSnapshot.label ?? `Snapshot #${activeSnapshot.id}`}</span
					>
				</div>
				<!-- Viewer iframe -->
				<div
					class="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"
					style="height: calc(100svh - 220px)"
				>
					<!-- /api/view/${activeWorkspace.adminUsername ?? data.user.username}/${activeWorkspace.name}/${activeSnapshot.id} -->
					<iframe
						src={`/api/view/${activeSnapshot.id}`}
						title="Slack archive"
						class="h-full w-full border-0"
						sandbox="allow-scripts allow-same-origin"
					></iframe>
				</div>
			{:else if loadingSnapshots}
				<div class="flex items-center justify-center gap-2 py-24 text-zinc-600">
					<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"
						><circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						/><path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
						/></svg
					>
					Loading snapshots…
				</div>
			{:else if workspaceSnapshots.length === 0}
				<div class="py-24 text-center text-zinc-600">
					<div class="mb-3 text-4xl">📸</div>
					<p class="text-sm">No snapshots yet.</p>
					{#if activeWorkspace.role === 'admin'}
						<p class="mt-2 text-xs text-zinc-700">
							Go to <button
								onclick={() => {
									view = 'admin';
								}}
								class="text-violet-500 underline underline-offset-2 hover:text-violet-400"
								>Admin → Settings</button
							> to take one or configure a schedule.
						</p>
					{/if}
				</div>
			{:else}
				<div class="space-y-2">
					{#each workspaceSnapshots as snap}
						<button
							onclick={() => (activeSnapshot = snap)}
							class="group flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 text-left transition-all hover:border-zinc-700 hover:bg-zinc-800/80"
						>
							<div class="flex items-center gap-4">
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800"
								>
									<svg
										class="h-4 w-4 text-zinc-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1.5"
											d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
										/></svg
									>
								</div>
								<div>
									<p class="text-sm font-medium text-zinc-200">
										{snap.label ?? `Snapshot #${snap.id}`}
									</p>
									<p class="mt-0.5 text-xs text-zinc-500">
										{new Date(snap.createdAt).toLocaleString()}
									</p>
								</div>
							</div>
							<svg
								class="h-4 w-4 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5l7 7-7 7"
								/></svg
							>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</main>
</div>
