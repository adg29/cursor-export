#!/usr/bin/env node

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { exportAllChatHistory, getAllWorkspaces } = require("./index.js");
const { exportAllWorkspaces } = require("./exportFiles/fileExporter");
const path = require("path");
const fs = require("fs");

async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage("Usage: $0 [options]")
    .option("workspacePath", {
      alias: "w",
      describe: "Path to Cursor workspace storage",
      type: "string",
      default:
        "/Users/adg/Library/Application Support/Cursor/User/workspaceStorage",
    })
    .option("only", {
      alias: "o",
      describe:
        "Only export workspaces whose name, folder path, or id includes this string (case-insensitive)",
      type: "string",
    })
    .option("list", {
      alias: "L",
      describe:
        "List discovered workspaces (apply --only filter if provided) and exit",
      type: "boolean",
      default: false,
    })
    .help("h")
    .alias("h", "help").argv;

  try {
    // Set workspace path from CLI argument
    process.env.WORKSPACE_PATH = argv.workspacePath;

    console.log("Starting export from:", argv.workspacePath);
    if (argv.only) {
      console.log("Workspace filter:", argv.only);
    }

    if (argv.list) {
      const all = await getAllWorkspaces();
      const filter = argv.only ? String(argv.only).toLowerCase() : null;
      const filtered = filter
        ? all.filter((ws) => {
            const folderPath = ws.folder || "";
            const base = folderPath ? path.basename(folderPath) : "";
            return (
              String(ws.id).toLowerCase().includes(filter) ||
              folderPath.toLowerCase().includes(filter) ||
              base.toLowerCase().includes(filter)
            );
          })
        : all;

      console.log(
        `\n${filtered.length} workspaces found${filter ? " (filtered)" : ""}:`
      );
      for (const ws of filtered) {
        const base = ws.folder ? path.basename(ws.folder) : ws.id;
        console.log(
          `- name: ${base}\n  id: ${ws.id}\n  folder: ${
            ws.folder || "<unknown>"
          }\n  chats: ${ws.chatCount}\n  lastModified: ${ws.lastModified}\n`
        );
      }
      return;
    }

    const chatHistory = await exportAllChatHistory(argv.only);

    // Export all workspaces
    await exportAllWorkspaces(chatHistory, "cursor-export-output");

    console.log(`\nExport completed successfully!`);
    console.log(`Total workspaces processed: ${chatHistory.length}`);
    console.log(`Output directory structure:`);
    console.log(`cursor-export-output/`);
    console.log(`  ├── html/`);
    console.log(`  │   └── <workspace_folders>/`);
    console.log(`  │       └── <timestamp>--<chat_title>.html`);
    console.log(`  ├── markdown/`);
    console.log(`  │   └── <workspace_folders>/`);
    console.log(`  │       └── <timestamp>--<chat_title>.md`);
    console.log(`  └── json/`);
    console.log(`      └── <workspace_name>.json`);
  } catch (error) {
    console.error("Export failed:", error);
    process.exit(1);
  }
}

function getMarkdownCssPath() {
  const possiblePaths = [
    path.resolve(__dirname, "github-markdown.css"),
    path.join(__dirname, "github-markdown.css"),
    "./github-markdown.css",
  ];

  for (const cssPath of possiblePaths) {
    try {
      if (fs.existsSync(cssPath)) {
        return cssPath;
      }
    } catch (error) {
      // 忽略不存在的路径
    }
  }

  throw new Error("Cannot find github-markdown.css");
}

async function convertToHtml(markdown) {
  const cssPath = getMarkdownCssPath();
  const css = await fs.promises.readFile(cssPath, "utf-8");
  // ... 其余的转换逻辑保持不变
}

main();
