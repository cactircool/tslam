import {
	pgTable,
	serial,
	text,
	integer,
	primaryKey,
	timestamp,
	unique,
	boolean
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const workspace = pgTable(
	'workspace',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		botToken: text('bot_token').notNull(),
		admin: text('admin')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' })
	},
	(table) => [unique().on(table.admin, table.name)]
);

export const workspace_member = pgTable(
	'workspace_member',
	{
		workspace: integer('workspace')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
		member: text('member')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' })
	},
	(table) => [primaryKey({ columns: [table.workspace, table.member] })]
);

export const snapshot = pgTable('snapshot', {
	id: serial('id').primaryKey(),
	workspace: integer('workspace')
		.notNull()
		.references(() => workspace.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	label: text('label')
});

export const workspace_join_request = pgTable('workspace_join_request', {
	id: serial('id').primaryKey(),
	workspace: integer('workspace')
		.notNull()
		.references(() => workspace.id, { onDelete: 'cascade' }),
	requester: text('requester')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	status: text('status').notNull().default('pending'),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

export const snapshot_schedule = pgTable('snapshot_schedule', {
	id: serial('id').primaryKey(),
	workspace: integer('workspace')
		.notNull()
		.unique()
		.references(() => workspace.id, { onDelete: 'cascade' }),
	intervalDays: integer('interval_days').notNull(),
	lastRun: timestamp('last_run'),
	nextRun: timestamp('next_run').notNull(),
	enabled: boolean('enabled').notNull().default(true)
});

export const workspace_member_permission = pgTable(
	'workspace_member_permission',
	{
		id: serial('id').primaryKey(),
		workspace: integer('workspace')
			.notNull()
			.references(() => workspace.id, { onDelete: 'cascade' }),
		member: text('member')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		canViewChannels: boolean('can_view_channels').notNull().default(true),
		canViewDMs: boolean('can_view_dms').notNull().default(false),
		canViewFiles: boolean('can_view_files').notNull().default(true),
		canViewThreads: boolean('can_view_threads').notNull().default(true),
		canViewUserProfiles: boolean('can_view_user_profiles').notNull().default(true),
		canExport: boolean('can_export').notNull().default(false)
	},
	(table) => [unique().on(table.workspace, table.member)]
);

export * from './auth.schema';
