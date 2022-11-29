import { Database, Statement as BunStatement } from 'bun:sqlite';
import { Logger, NoopLogger } from 'drizzle-orm';
import { fillPlaceholders, Query } from 'drizzle-orm/sql';
import { mapResultRowV2 } from 'drizzle-orm/utils';
import { SQLiteSyncDialect } from '~/dialect';
import { SelectFieldsOrdered } from '~/operations';
import {
	PreparedQuery as PreparedQueryBase,
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteSession,
} from '~/session';

export interface SQLiteBunSessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;
type Statement = BunStatement<any>;

export class SQLiteBunSession extends SQLiteSession<'sync', void> {
	private logger: Logger;

	constructor(
		private client: Database,
		dialect: SQLiteSyncDialect,
		options: SQLiteBunSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields?: SelectFieldsOrdered,
	): PreparedQuery<T> {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields);
	}
}

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'sync'; run: void; all: T['all']; get: T['get']; values: T['values'] }
> {
	constructor(
		private stmt: Statement,
		private queryString: string,
		private params: unknown[],
		private logger: Logger,
		private fields: SelectFieldsOrdered | undefined,
	) {
		super();
	}

	run(placeholderValues?: Record<string, unknown>): void {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.run(...params);
	}

	all(placeholderValues?: Record<string, unknown>): T['all'] {
		const { fields } = this;
		if (!fields) {
			throw new Error('Statement does not return any data - use run()');
		}

		const values = this.values(placeholderValues);

		return values.map((row) => mapResultRowV2(fields, row));
	}

	get(placeholderValues?: Record<string, unknown>): T['get'] {
		const { fields } = this;
		if (!fields) {
			throw new Error('Statement does not return any data - use run()');
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		const value = this.stmt.get(...params);

		return mapResultRowV2(fields, value);
	}

	values(placeholderValues?: Record<string, unknown>): T['values'] {
		if (!this.fields) {
			throw new Error('Statement does not return any data - use run()');
		}

		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.values(...params);
	}
}
