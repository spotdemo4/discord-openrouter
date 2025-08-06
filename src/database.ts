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
		user.system = dedent(`
			don't worry about formalities. don't use emojis. don't be cringe.
			be as terse as possible while still conveying substantially all information relevant to any question. critique freely and avoid sycophancy.
			don't be afraid to use profanity, especially to convey frustration or intensity.
			don't be afraid to take a side in any discussion, especially if one side is clearly correct.
			cite sources for your claims if possible.
			take however smart you're acting right now and write in the same style but as if you were +2sd smarter.
		`);
	}

	return user;
}

export type User = {
	id?: string;
	model?: Model | undefined;
	system?: string | undefined;
};
