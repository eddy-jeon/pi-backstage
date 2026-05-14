/**
 * Backstage — Universal Tool Folding
 *
 * Keeps tools behind the curtain. Only conversation remains in the spotlight.
 *
 * - All tool output collapsed by default
 * - Built-in tools: minimal one-line summary
 * - Future tools (any extension): auto-wrapped, hidden when collapsed
 * - Errors surface even when collapsed
 *
 * Toggle: /backstage
 * Expand all tools: Ctrl+O
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { homedir } from "os";
import { basename, dirname } from "node:path";

let backstageMode = true;

function shortenPath(path: string, max = 45): string {
	if (!path) return "...";

	const home = homedir();
	let s = path.startsWith(home) ? `~${path.slice(home.length)}` : path;

	if (s.length <= max) return s;

	const file = basename(s);
	const dir = dirname(s);

	// If just the filename is already too long, truncate filename
	if (file.length > max - 5) {
		return `${file.slice(0, max - 5)}…`;
	}

	// Keep start of dir + ... + filename
	const keep = max - file.length - 4; // 4 = "/..."
	if (keep > 3) {
		return `${dir.slice(0, keep)}…/${file}`;
	}

	return `…/${file}`;
}

const toolCache = new Map<string, ReturnType<typeof createBuiltInTools>>();

function createBuiltInTools(cwd: string) {
	return {
		read: createReadTool(cwd),
		bash: createBashTool(cwd),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		find: createFindTool(cwd),
		grep: createGrepTool(cwd),
		ls: createLsTool(cwd),
	};
}

function getBuiltInTools(cwd: string) {
	let tools = toolCache.get(cwd);
	if (!tools) {
		tools = createBuiltInTools(cwd);
		toolCache.set(cwd, tools);
	}
	return tools;
}

function applyMode(ctx: ExtensionContext) {
	ctx.ui.setToolsExpanded(!backstageMode);
	ctx.ui.setHiddenThinkingLabel(backstageMode ? "💭 Thinking..." : undefined);
}

/* ── generic wrappers for unknown future tools ─────────────────────── */

function genericCall(toolName: string) {
	return (_args: any, theme: any) =>
		new Text(`${theme.fg("dim", "◎")} ${theme.fg("muted", toolName)}`, 0, 0);
}

function wrapResult(original: any) {
	return (result: any, options: { expanded: boolean }, theme: any, context: any) => {
		if (backstageMode && !options.expanded) {
			return new Text("", 0, 0);
		}
		if (original) return original(result, options, theme, context);
		const text = result.content?.find((c: any) => c.type === "text");
		if (!text || text.type !== "text") return new Text("", 0, 0);
		return new Text(`\n${theme.fg("toolOutput", text.text)}`, 0, 0);
	};
}

/* ── main ──────────────────────────────────────────────────────────── */

export default function (pi: ExtensionAPI) {
	const _originalRegister = pi.registerTool.bind(pi);
	pi.registerTool = (tool: any) => {
		const wrapped = {
			...tool,
			renderCall: tool.renderCall ?? genericCall(tool.label || tool.name),
			renderResult: wrapResult(tool.renderResult),
		};
		return _originalRegister(wrapped);
	};

	pi.on("session_start", async (_event, ctx) => {
		applyMode(ctx);
	});

	pi.registerCommand("backstage", {
		description: "Toggle backstage (hide tool noise)",
		handler: async (_args, ctx) => {
			backstageMode = !backstageMode;
			applyMode(ctx);
			ctx.ui.notify(backstageMode ? "Backstage ON" : "Backstage OFF", "info");
		},
	});

	/* Built-in overrides via raw register to avoid double-wrapping */

	_originalRegister({
		name: "read",
		label: "read",
		description: "Read file contents",
		parameters: getBuiltInTools(process.cwd()).read.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).read.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			const p = shortenPath(args.path);
			return new Text(`${theme.fg("dim", "📄")} ${theme.fg("muted", p)}`, 0, 0);
		},
		renderResult(result: any, options: { expanded: boolean }, theme: any) {
			if (backstageMode && !options.expanded) return new Text("", 0, 0);
			const text = result.content?.find((c: any) => c.type === "text");
			if (!text || text.type !== "text") return new Text("", 0, 0);
			return new Text(`\n${text.text.split("\n").map((l: string) => theme.fg("toolOutput", l)).join("\n")}`, 0, 0);
		},
	});

	_originalRegister({
		name: "bash",
		label: "bash",
		description: "Execute bash command",
		parameters: getBuiltInTools(process.cwd()).bash.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).bash.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			const cmd = (args.command || "").slice(0, 50);
			const suffix = (args.command || "").length > 50 ? "…" : "";
			return new Text(`${theme.fg("dim", "⚡")} ${theme.fg("muted", `$ ${cmd}${suffix}`)}`, 0, 0);
		},
		renderResult(result: any, options: { expanded: boolean }, theme: any) {
			if (backstageMode && !options.expanded) return new Text("", 0, 0);
			const text = result.content?.find((c: any) => c.type === "text");
			if (!text || text.type !== "text") return new Text("", 0, 0);
			const out = text.text.trim().split("\n").map((l: string) => theme.fg("toolOutput", l)).join("\n");
			return out ? new Text(`\n${out}`, 0, 0) : new Text("", 0, 0);
		},
	});

	_originalRegister({
		name: "write",
		label: "write",
		description: "Write to a file",
		parameters: getBuiltInTools(process.cwd()).write.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).write.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			const p = shortenPath(args.path);
			return new Text(`${theme.fg("dim", "✏️")} ${theme.fg("muted", p)}`, 0, 0);
		},
		renderResult(result: any, options: { expanded: boolean }, theme: any) {
			if (backstageMode && !options.expanded) return new Text("", 0, 0);
			const text = result.content?.find((c: any) => c.type === "text");
			if (text?.type === "text" && text.text) {
				return new Text(`\n${theme.fg("error", text.text)}`, 0, 0);
			}
			return new Text("", 0, 0);
		},
	});

	_originalRegister({
		name: "edit",
		label: "edit",
		description: "Edit a file by replacing text",
		parameters: getBuiltInTools(process.cwd()).edit.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).edit.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			const p = shortenPath(args.path);
			return new Text(`${theme.fg("dim", "🔧")} ${theme.fg("muted", p)}`, 0, 0);
		},
		renderResult(result: any, options: { expanded: boolean }, theme: any) {
			if (backstageMode && !options.expanded) return new Text("", 0, 0);
			const text = result.content?.find((c: any) => c.type === "text");
			if (!text || text.type !== "text") return new Text("", 0, 0);
			if (text.text.includes("Error") || text.text.includes("error")) {
				return new Text(`\n${theme.fg("error", text.text)}`, 0, 0);
			}
			return new Text(`\n${theme.fg("success", "edited")}`, 0, 0);
		},
	});

	_originalRegister({
		name: "find",
		label: "find",
		description: "Find files by pattern",
		parameters: getBuiltInTools(process.cwd()).find.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).find.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			const pat = (args.pattern || "").slice(0, 40);
			const suffix = (args.pattern || "").length > 40 ? "…" : "";
			return new Text(`${theme.fg("dim", "🔍")} ${theme.fg("muted", pat + suffix)}`, 0, 0);
		},
		renderResult(result: any, options: { expanded: boolean }, theme: any) {
			if (backstageMode && !options.expanded) return new Text("", 0, 0);
			const text = result.content?.find((c: any) => c.type === "text");
			if (!text || text.type !== "text") return new Text("", 0, 0);
			return new Text(`\n${text.text.trim().split("\n").map((l: string) => theme.fg("toolOutput", l)).join("\n")}`, 0, 0);
		},
	});

	_originalRegister({
		name: "grep",
		label: "grep",
		description: "Search file contents by pattern",
		parameters: getBuiltInTools(process.cwd()).grep.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).grep.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			const pat = args.pattern || "";
			const display = pat.length > 38 ? `/${pat.slice(0, 37)}…/` : `/${pat}/`;
			return new Text(`${theme.fg("dim", "🔎")} ${theme.fg("muted", display)}`, 0, 0);
		},
		renderResult(result: any, options: { expanded: boolean }, theme: any) {
			if (backstageMode && !options.expanded) return new Text("", 0, 0);
			const text = result.content?.find((c: any) => c.type === "text");
			if (!text || text.type !== "text") return new Text("", 0, 0);
			return new Text(`\n${text.text.trim().split("\n").map((l: string) => theme.fg("toolOutput", l)).join("\n")}`, 0, 0);
		},
	});

	_originalRegister({
		name: "ls",
		label: "ls",
		description: "List directory contents",
		parameters: getBuiltInTools(process.cwd()).ls.parameters,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return getBuiltInTools(ctx.cwd).ls.execute(toolCallId, params, signal, onUpdate);
		},
		renderCall(args: any, theme: any) {
			const p = shortenPath(args.path || ".");
			return new Text(`${theme.fg("dim", "📁")} ${theme.fg("muted", p)}`, 0, 0);
		},
		renderResult(result: any, options: { expanded: boolean }, theme: any) {
			if (backstageMode && !options.expanded) return new Text("", 0, 0);
			const text = result.content?.find((c: any) => c.type === "text");
			if (!text || text.type !== "text") return new Text("", 0, 0);
			return new Text(`\n${text.text.trim().split("\n").map((l: string) => theme.fg("toolOutput", l)).join("\n")}`, 0, 0);
		},
	});
}
