import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import {
	workspace,
	workspace_member,
	workspace_join_request,
	snapshot,
	snapshot_schedule,
	workspace_member_permission,
	user
} from '$lib/server/db/schema';
import { redirect } from '@sveltejs/kit';
import { eq, inArray, and } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) redirect(302, '/login');

	const userId = session.user.id;

	const adminWorkspaces = await db.select().from(workspace).where(eq(workspace.admin, userId));
	const adminWorkspaceIds = adminWorkspaces.map((w) => w.id);

	const memberRows = await db
		.select({ workspace: workspace, adminUsername: user.username })
		.from(workspace_member)
		.innerJoin(workspace, eq(workspace_member.workspace, workspace.id))
		.innerJoin(user, eq(workspace.admin, user.id))
		.where(eq(workspace_member.member, userId));
	const memberWorkspaces = memberRows.map((r) => ({
		...r.workspace,
		adminUsername: r.adminUsername
	}));

	const myRequests = await db
		.select({ request: workspace_join_request, workspaceName: workspace.name })
		.from(workspace_join_request)
		.innerJoin(workspace, eq(workspace_join_request.workspace, workspace.id))
		.where(eq(workspace_join_request.requester, userId));

	const incomingRequests =
		adminWorkspaceIds.length > 0
			? await db
					.select({
						request: workspace_join_request,
						requesterName: user.name,
						requesterUsername: user.username,
						workspaceId: workspace.id,
						workspaceName: workspace.name
					})
					.from(workspace_join_request)
					.innerJoin(user, eq(workspace_join_request.requester, user.id))
					.innerJoin(workspace, eq(workspace_join_request.workspace, workspace.id))
					.where(
						and(
							inArray(workspace_join_request.workspace, adminWorkspaceIds),
							eq(workspace_join_request.status, 'pending')
						)
					)
			: [];

	const schedules =
		adminWorkspaceIds.length > 0
			? await db
					.select()
					.from(snapshot_schedule)
					.where(inArray(snapshot_schedule.workspace, adminWorkspaceIds))
			: [];

	const membersWithPerms =
		adminWorkspaceIds.length > 0
			? await db
					.select({
						workspaceId: workspace_member.workspace,
						memberId: user.id,
						memberName: user.name,
						memberUsername: user.username,
						perm: workspace_member_permission
					})
					.from(workspace_member)
					.innerJoin(user, eq(workspace_member.member, user.id))
					.leftJoin(
						workspace_member_permission,
						and(
							eq(workspace_member_permission.workspace, workspace_member.workspace),
							eq(workspace_member_permission.member, workspace_member.member)
						)
					)
					.where(inArray(workspace_member.workspace, adminWorkspaceIds))
			: [];

	// Strip botToken before sending to the client — never expose it
	const safeAdminWorkspaces = adminWorkspaces.map(({ botToken: _, ...rest }) => rest);
	const safeMemberWorkspaces = memberWorkspaces.map(({ botToken: _, ...rest }) => rest);

	return {
		user: session.user,
		adminWorkspaces: safeAdminWorkspaces,
		memberWorkspaces: safeMemberWorkspaces,
		myRequests,
		incomingRequests,
		schedules,
		membersWithPerms
	};
};

export const actions: Actions = {
	createWorkspace: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(302, '/login');
		const data = await request.formData();
		const name = (data.get('name') as string).trim();
		const botToken = (data.get('botToken') as string).trim();
		if (!name || !botToken) return { error: 'All fields required.' };
		if (!botToken.startsWith('xoxb-')) return { error: 'Bot token must start with xoxb-.' };
		try {
			await db.insert(workspace).values({ name, botToken, admin: session.user.id });
		} catch {
			return { error: 'A workspace with that name already exists.' };
		}
	},

	updateWorkspace: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(302, '/login');
		const data = await request.formData();
		const wsId = Number(data.get('workspaceId'));
		const name = (data.get('name') as string).trim();
		const botToken = (data.get('botToken') as string).trim();
		const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
		if (!ws || ws.admin !== session.user.id) return { error: 'Unauthorized.' };
		if (botToken && !botToken.startsWith('xoxb-'))
			return { updateError: 'Bot token must start with xoxb-.' };
		try {
			await db
				.update(workspace)
				.set({ ...(name && { name }), ...(botToken && { botToken }) })
				.where(eq(workspace.id, wsId));
		} catch {
			return { updateError: 'A workspace with that name already exists.' };
		}
	},

	upsertSchedule: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(302, '/login');
		const data = await request.formData();
		const wsId = Number(data.get('workspaceId'));
		const intervalDays = Number(data.get('intervalDays'));
		const enabled = data.get('enabled') === 'true';
		const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
		if (!ws || ws.admin !== session.user.id) return { error: 'Unauthorized.' };
		const nextRun = new Date();
		nextRun.setDate(nextRun.getDate() + intervalDays);
		const [existing] = await db
			.select()
			.from(snapshot_schedule)
			.where(eq(snapshot_schedule.workspace, wsId));
		if (existing) {
			await db
				.update(snapshot_schedule)
				.set({ intervalDays, enabled, nextRun })
				.where(eq(snapshot_schedule.workspace, wsId));
		} else {
			await db
				.insert(snapshot_schedule)
				.values({ workspace: wsId, intervalDays, enabled, nextRun });
		}
	},

	takeSnapshot: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(302, '/login');
		const data = await request.formData();
		const wsId = Number(data.get('workspaceId'));
		const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
		if (!ws || ws.admin !== session.user.id) return { error: 'Unauthorized.' };

		const { createSnapshot } = await import('$lib/server/dump');
		const label = await createSnapshot(session.user.username, ws.name, ws.botToken);
		if (!label) return { error: 'Snapshot failed. Check server logs.' };

		await db.insert(snapshot).values({ workspace: wsId, label });
		await db
			.update(snapshot_schedule)
			.set({ lastRun: new Date() })
			.where(eq(snapshot_schedule.workspace, wsId));
	},

	updatePermissions: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(302, '/login');
		const data = await request.formData();
		const wsId = Number(data.get('workspaceId'));
		const memberId = data.get('memberId') as string;
		const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
		if (!ws || ws.admin !== session.user.id) return { error: 'Unauthorized.' };
		const perms = {
			canViewChannels: data.get('canViewChannels') === 'true',
			canViewDMs: data.get('canViewDMs') === 'true',
			canViewFiles: data.get('canViewFiles') === 'true',
			canViewThreads: data.get('canViewThreads') === 'true',
			canViewUserProfiles: data.get('canViewUserProfiles') === 'true',
			canExport: data.get('canExport') === 'true'
		};
		const [existing] = await db
			.select()
			.from(workspace_member_permission)
			.where(
				and(
					eq(workspace_member_permission.workspace, wsId),
					eq(workspace_member_permission.member, memberId)
				)
			);
		if (existing) {
			await db
				.update(workspace_member_permission)
				.set(perms)
				.where(
					and(
						eq(workspace_member_permission.workspace, wsId),
						eq(workspace_member_permission.member, memberId)
					)
				);
		} else {
			await db
				.insert(workspace_member_permission)
				.values({ workspace: wsId, member: memberId, ...perms });
		}
	},

	removeMember: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(302, '/login');
		const data = await request.formData();
		const wsId = Number(data.get('workspaceId'));
		const memberId = data.get('memberId') as string;
		const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
		if (!ws || ws.admin !== session.user.id) return { error: 'Unauthorized.' };
		await db
			.delete(workspace_member)
			.where(and(eq(workspace_member.workspace, wsId), eq(workspace_member.member, memberId)));
		await db
			.delete(workspace_member_permission)
			.where(
				and(
					eq(workspace_member_permission.workspace, wsId),
					eq(workspace_member_permission.member, memberId)
				)
			);
	},

	respondToRequest: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(302, '/login');
		const data = await request.formData();
		const requestId = Number(data.get('requestId'));
		const action = data.get('action') as 'approved' | 'denied';
		const [joinReq] = await db
			.update(workspace_join_request)
			.set({ status: action })
			.where(eq(workspace_join_request.id, requestId))
			.returning();
		if (action === 'approved') {
			await db
				.insert(workspace_member)
				.values({ workspace: joinReq.workspace, member: joinReq.requester });
		}
	},

	requestToJoin: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) redirect(302, '/login');
		const data = await request.formData();
		await db.insert(workspace_join_request).values({
			workspace: Number(data.get('workspaceId')),
			requester: session.user.id
		});
	}
};
