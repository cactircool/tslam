import { db } from '$lib/server/db';
import { snapshot, workspace_member, workspace } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import { eq, and } from 'drizzle-orm';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) error(401);

	const wsId = Number(params.id);
	const userId = session.user.id;

	// verify access
	const [ws] = await db.select().from(workspace).where(eq(workspace.id, wsId));
	if (!ws) error(404);
	const isAdmin = ws.admin === userId;
	const [membership] = isAdmin
		? [true]
		: await db
				.select()
				.from(workspace_member)
				.where(and(eq(workspace_member.workspace, wsId), eq(workspace_member.member, userId)));

	if (!isAdmin && !membership) error(403);

	const snapshots = await db
		.select()
		.from(snapshot)
		.where(eq(snapshot.workspace, wsId))
		.orderBy(snapshot.createdAt);

	return json({ snapshots });
};
