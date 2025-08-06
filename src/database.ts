import { DatabaseSync } from "node:sqlite";
import { leastExpensive, type Model, models } from "./model.js";
import { dedent } from "./util.js";

export const database = new DatabaseSync("users.db");

// Make sure the users table exists
database.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		model TEXT,
		system TEXT
	);
`);

export function getUser(id: string) {
	const query = database.prepare("SELECT * FROM users WHERE id = ?");
	const result = query.get(id);

	const user: User = {};

	if (result?.id) user.id = result.id.toString();

	if (result?.model) {
		user.model = models.find((m) => m.id === result.model);
	} else {
		// Default to the least expensive model if model is not found
		user.model = leastExpensive(models);
	}

	if (result?.system) {
		user.system = result.system.toString();
	} else {
		// Default system prompt
		user.system = dedent(
			process.env.DEFAULT_PROMPT ?? "You are a helpful assistant.",
		);
	}

	return user;
}

export type User = {
	id?: string;
	model?: Model | undefined;
	system?: string | undefined;
};
