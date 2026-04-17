import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { db } from '$lib/server/db';
import { snapshot, snapshot_schedule, workspace, user } from '$lib/server/db/schema';
import { createSnapshot } from '$lib/server/dump';
import { eq, and, lte } from 'drizzle-orm';

setInterval(
	async () => {
		const now = new Date();
		const due = await db
			.select({ sched: snapshot_schedule, ws: workspace, adminUsername: user.username })
			.from(snapshot_schedule)
			.innerJoin(workspace, eq(snapshot_schedule.workspace, workspace.id))
			.innerJoin(user, eq(workspace.admin, user.id))
			.where(and(eq(snapshot_schedule.enabled, true), lte(snapshot_schedule.nextRun, now)));

		for (const { sched, ws, adminUsername } of due) {
			const label = await createSnapshot(adminUsername, ws.name, ws.botToken);
			if (label) {
				await db.insert(snapshot).values({ workspace: ws.id, label });
				const next = new Date();
				next.setDate(next.getDate() + sched.intervalDays);
				await db
					.update(snapshot_schedule)
					.set({ lastRun: now, nextRun: next })
					.where(eq(snapshot_schedule.id, sched.id));
			}
		}
	},
	60 * 60 * 1000
); // runs every hour

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
