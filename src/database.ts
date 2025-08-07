import { DatabaseSync } from "node:sqlite";
import { getModel, type Model } from "./model.js";
import { dedent } from "./util.js";

export const database = new DatabaseSync(
	`${process.env.DB_PATH ?? "db.sqlite"}`,
);

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

	const model = getModel(result?.model?.toString());

	let system: string;
	if (result?.system) {
		system = dedent(result.system.toString());
	} else if (process.env.DEFAULT_PROMPT) {
		system = dedent(process.env.DEFAULT_PROMPT);
	} else {
		system = "You are a helpful assistant.";
	}

	const user: User = {
		id: id,
		model: model,
		system: system,
	};

	return user;
}

export type User = {
	id?: string;
	model: Model;
	system: string;
};
