const path = require("path");
const fs = require("fs").promises;
const { existsSync } = require("fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const os = require("os");

const DEBUG = false;

// Export chat history for all workspaces
async function exportAllChatHistory(onlyFilter) {
  try {
    let workspaces = await getAllWorkspaces();

    let filterdWorkspaces = DEBUG
      ? workspaces.filter((w) => {
          if (w && w.folder) {
            return w.folder.endsWith("cursor-export");
          }
          return false;
        })
      : workspaces;

    const allChats = [];

    // Apply filter if provided (match on folder basename, full folder path, or id)
    const normalizedFilter = onlyFilter
      ? String(onlyFilter).toLowerCase()
      : null;

    const candidateWorkspaces = normalizedFilter
      ? filterdWorkspaces.filter((ws) => {
          try {
            const folderPath = ws.folder || "";
            const folderBase = folderPath ? path.basename(folderPath) : "";
            return (
              String(ws.id).toLowerCase().includes(normalizedFilter) ||
              folderPath.toLowerCase().includes(normalizedFilter) ||
              folderBase.toLowerCase().includes(normalizedFilter)
            );
          } catch (_) {
            return false;
          }
        })
      : filterdWorkspaces;

    for (const workspace of candidateWorkspaces) {
      try {
        const detail = await getWorkspaceDetail(workspace.id, workspace.folder);

        if (DEBUG) {
          if (detail) {
            await fs.writeFile(
              "debug/detail.json",
              JSON.stringify(detail, null, 2)
            );
          }
        }

        allChats.push({
          workspaceInfo: workspace,
          chatData: detail,
        });
      } catch (error) {
        console.error(
          `Error getting details for workspace ${workspace.id}:`,
          error
        );
      }
    }

    if (DEBUG) {
      await fs.writeFile(
        "debug/allChats.json",
        JSON.stringify(allChats, null, 2)
      );
    }

    return allChats;
  } catch (error) {
    console.error("Failed to export chat history:", error);
    throw error;
  }
}

// Helper function to safely parse timestamps
const safeParseTimestamp = (timestamp) => {
  try {
    if (!timestamp) {
      return new Date().toISOString();
    }
    return new Date(timestamp).toISOString();
  } catch (error) {
    console.error("Error parsing timestamp:", error, "Raw value:", timestamp);
    return new Date().toISOString();
  }
};

// Get all workspaces with chat data
async function getAllWorkspaces() {
  try {
    const workspacePath =
      process.env.WORKSPACE_PATH ||
      "/Users/adg/Library/Application Support/Cursor/User/workspaceStorage";
    const workspaces = [];

    const entries = await fs.readdir(workspacePath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dbPath = path.join(workspacePath, entry.name, "state.vscdb");
        const workspaceJsonPath = path.join(
          workspacePath,
          entry.name,
          "workspace.json"
        );

        if (!existsSync(dbPath)) {
          console.log(`Skipping ${entry.name}: no state.vscdb found`);
          continue;
        }

        try {
          const stats = await fs.stat(dbPath);
          const db = await open({
            filename: dbPath,
            driver: sqlite3.Database,
          });

          const result = await db.get(`
            SELECT value FROM ItemTable 
            WHERE [key] = 'workbench.panel.aichat.view.aichat.chatdata'
          `);

          let chatCount = 0;
          if (result?.value) {
            try {
              const chatData = JSON.parse(result.value);
              chatCount = chatData.tabs?.length || 0;
            } catch (error) {
              console.error("Error parsing chat data:", error);
            }
          }

          let folder = undefined;
          try {
            const workspaceData = JSON.parse(
              await fs.readFile(workspaceJsonPath, "utf-8")
            );
            folder = workspaceData.folder;
          } catch (error) {
            console.log(`No workspace.json found for ${entry.name}`);
          }

          workspaces.push({
            id: entry.name,
            path: dbPath,
            folder: folder,
            lastModified: stats.mtime.toISOString(),
            chatCount: chatCount,
          });

          await db.close();
        } catch (error) {
          console.error(`Error processing workspace ${entry.name}:`, error);
        }
      }
    }

    return workspaces;
  } catch (error) {
    console.error("Failed to get workspaces:", error);
    throw error;
  }
}

// Get detailed chat data for a specific workspace
async function getWorkspaceDetail(workspaceId, workspaceFolder) {
  try {
    const workspacePath =
      process.env.WORKSPACE_PATH ||
      "/Users/adg/Library/Application Support/Cursor/User/workspaceStorage";
    const dbPath = path.join(workspacePath, workspaceId, "state.vscdb");

    if (DEBUG) {
      console.log("workspaceId", workspaceId);
      console.log("dbPath", dbPath);
    }

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    const chatResult = await db.get(`
      SELECT value FROM ItemTable
      WHERE [key] = 'workbench.panel.aichat.view.aichat.chatdata'
    `);

    if (DEBUG) {
      console.log("chatResult", chatResult);
    }

    const composerResult = await db.get(`
      SELECT value FROM ItemTable
      WHERE [key] = 'composer.composerData'
    `);

    await db.close();

    if (!chatResult && !composerResult) {
      return {
        tabs: [],
        composers: {
          allComposers: [],
        },
      };
    }

    const response = { tabs: [] };

    if (chatResult) {
      const chatData = JSON.parse(chatResult.value);
      response.tabs = chatData.tabs.map((tab) => ({
        id: tab.tabId,
        title: tab.chatTitle?.split("\n")[0] || `Chat ${tab.tabId.slice(0, 8)}`,
        timestamp: safeParseTimestamp(tab.lastSendTime),
        bubbles: tab.bubbles,
      }));
    }

    if (DEBUG) {
      if (chatResult) {
        await fs.writeFile("debug/chatResult.json", chatResult.value, null, 2);
      }

      if (composerResult) {
        await fs.writeFile(
          "debug/composerResult.json",
          composerResult.value,
          null,
          2
        );
      }
    }

    if (composerResult) {
      const globalDbPath = path.join(
        workspacePath,
        "..",
        "globalStorage",
        "state.vscdb"
      );
      const composers = JSON.parse(composerResult.value);
      const keys = composers.allComposers.map(
        (it) => `composerData:${it.composerId}`
      );
      const placeholders = keys.map(() => "?").join(",");

      const globalDb = await open({
        filename: globalDbPath,
        driver: sqlite3.Database,
      });

      const composersBodyResult = await globalDb.all(
        `
        SELECT [key], value FROM cursorDiskKV
        WHERE [key] in (${placeholders})
      `,
        keys
      );

      // Enrich composers by resolving bubble conversations from global KV
      const composerDetails = [];
      if (composersBodyResult && composersBodyResult.length > 0) {
        for (const result of composersBodyResult) {
          const composerId = result.key.replace("composerData:", "");
          const composerData = JSON.parse(result.value);

          // Build conversation from either existing conversation or bubble headers
          let conversation = Array.isArray(composerData.conversation)
            ? composerData.conversation
            : [];

          if (
            conversation.length === 0 &&
            Array.isArray(composerData.fullConversationHeadersOnly)
          ) {
            const bubbles = [];
            for (const hdr of composerData.fullConversationHeadersOnly) {
              try {
                const bubbleKey = `bubbleId:${composerId}:${hdr.bubbleId}`;
                const bubbleRow = await globalDb.get(
                  `SELECT value FROM cursorDiskKV WHERE [key] = ?`,
                  bubbleKey
                );
                if (bubbleRow && bubbleRow.value) {
                  const bubble = JSON.parse(bubbleRow.value);
                  // Normalize to conversation message
                  bubbles.push({
                    type: bubble.type, // 1 user, 2 ai
                    text: bubble.text || "",
                    suggestedCodeBlocks:
                      bubble.suggestedCodeBlocks || bubble.codeBlocks || [],
                  });
                }
              } catch (_) {
                // Ignore missing/parse errors per bubble
              }
            }
            conversation = bubbles;
          }

          composerDetails.push({
            ...composerData,
            composerId,
            conversation,
          });
        }
      }

      await globalDb.close();

      if (DEBUG) {
        await fs.writeFile(
          "debug/allComposers.json",
          JSON.stringify(composerDetails, null, 2)
        );
      }

      response.composers = {
        allComposers: composerDetails,
      };
    }

    // Fallback: scan globalStorage for composer data that may belong to this workspace
    const ensureArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    const normalizeFolder = (uriOrPath) => {
      if (!uriOrPath) return "";
      return String(uriOrPath).replace(/^file:\/\//, "");
    };
    const workspaceFolderPath = normalizeFolder(workspaceFolder);
    const workspaceFolderBase = workspaceFolderPath
      ? path.basename(workspaceFolderPath)
      : "";

    const matchesWorkspace = (obj) => {
      try {
        const haystack = JSON.stringify(obj).toLowerCase();
        const tokens = [
          String(workspaceId || "").toLowerCase(),
          String(workspaceFolderPath || "").toLowerCase(),
          String(workspaceFolderBase || "").toLowerCase(),
        ].filter(Boolean);
        return tokens.some((tok) => haystack.includes(tok));
      } catch (_) {
        return false;
      }
    };

    try {
      const globalDbPath = path.join(
        workspacePath,
        "..",
        "globalStorage",
        "state.vscdb"
      );
      const globalDb = await open({
        filename: globalDbPath,
        driver: sqlite3.Database,
      });
      // Fetch candidate KV entries that may contain conversations
      const kvRows = await globalDb.all(
        `SELECT [key], value FROM cursorDiskKV`
      );
      await globalDb.close();

      const extraComposers = [];
      const agentConversations = [];

      for (const row of kvRows) {
        if (!row || typeof row.value !== "string") continue;
        let data;
        try {
          data = JSON.parse(row.value);
        } catch (_) {
          continue;
        }

        // Composer-style data typically has conversation or suggestedCodeBlocks
        const looksLikeConversation =
          (Array.isArray(data?.conversation) && data.conversation.length > 0) ||
          (Array.isArray(data?.messages) && data.messages.length > 0);

        if (looksLikeConversation && matchesWorkspace(data)) {
          if (row.key.startsWith("composerData:")) {
            extraComposers.push({
              ...data,
              composerId: row.key.replace("composerData:", ""),
            });
          } else if (row.key.toLowerCase().includes("agent")) {
            agentConversations.push({ ...data, agentKey: row.key });
          }
        }
      }

      if (extraComposers.length > 0) {
        const existing = ensureArray(response?.composers?.allComposers);
        const merged = [...existing];
        const seen = new Set(existing.map((c) => c.composerId));
        for (const c of extraComposers) {
          if (!seen.has(c.composerId)) {
            merged.push(c);
            seen.add(c.composerId);
          }
        }
        response.composers = { allComposers: merged };
      }

      if (agentConversations.length > 0) {
        response.agents = agentConversations;
      }
    } catch (scanErr) {
      // Best-effort deep scan; ignore failures
    }

    if (DEBUG) {
      await fs.writeFile(
        "debug/response.json",
        JSON.stringify(response, null, 2)
      );
    }

    return response;
  } catch (error) {
    console.error("Failed to get workspace data:", error);
    throw error;
  }
}

module.exports = {
  getAllWorkspaces,
  getWorkspaceDetail,
  exportAllChatHistory,
};
