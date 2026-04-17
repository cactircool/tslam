import { db } from '$lib/server/db';
import { workspace, user } from '$lib/server/db/schema';
import { eq, like, inArray } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	if (!q) return json({ results: [] });

	const admins = await db
		.select({ id: user.id, username: user.username })
		.from(user)
		.where(like(user.username, `%${q}%`));

	if (admins.length === 0) return json({ results: [] });

	const workspaces = await db
		.select()
		.from(workspace)
		.where(
			inArray(
				workspace.admin,
				admins.map((a) => a.id)
			)
		);

	const results = workspaces.map((w) => ({
		id: w.id,
		name: w.name,
		adminUsername: admins.find((a) => a.id === w.admin)?.username ?? ''
	}));

	return json({ results });
};
