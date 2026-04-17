import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { snapshot, workspace, workspace_member } from '$lib/server/db/schema';
import { closeSnapshot } from '$lib/server/dump';
import { eq, and } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) error(401);

	const { snapshotId } = await request.json();
	if (!snapshotId) error(400, 'Missing snapshotId');

	// load snapshot + workspace to verify access and get names
	const [row] = await db
		.select({ snapshot, workspace })
		.from(snapshot)
		.innerJoin(workspace, eq(snapshot.workspace, workspace.id))
		.where(eq(snapshot.id, snapshotId));

	if (!row) error(404);

	const userId = session.user.id;
	const isAdmin = row.workspace.admin === userId;
	const [membership] = isAdmin
		? [true]
		: await db
				.select()
				.from(workspace_member)
				.where(
					and(eq(workspace_member.workspace, row.workspace.id), eq(workspace_member.member, userId))
				);

	if (!isAdmin && !membership) error(403);

	// resolve the admin's username for the path (viewer always lives under admin's namespace)
	const { user } = await import('$lib/server/db/schema');
	const [admin] = await db
		.select({ username: user.username })
		.from(user)
		.where(eq(user.id, row.workspace.admin));

	if (!admin) error(500, 'Admin not found');

	await closeSnapshot(admin.username, row.workspace.name, row.snapshot.label!);

	return json({ ok: true });
};
