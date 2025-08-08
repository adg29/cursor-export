const fs = require("fs").promises;
const path = require("path");
const { convertToMarkdown, convertToHtml } = require("./converters");
const { getSafeFilename } = require("./formatters");

async function createExportDirectories(outputDir) {
  // Create base output directory
  await fs.mkdir(outputDir, { recursive: true });

  // Create format-specific directories
  const formats = ["html", "markdown"];
  for (const format of formats) {
    await fs.mkdir(path.join(outputDir, format), { recursive: true });
  }
  // Create json directory separately since it doesn't need workspace subdirectories
  await fs.mkdir(path.join(outputDir, "json"), { recursive: true });
}

async function exportWorkspace(workspace, outputDir) {
  // Check if workspace has any data
  const hasChatTabs =
    workspace.chatData.tabs && workspace.chatData.tabs.length > 0;
  const hasComposers =
    workspace.chatData.composers &&
    workspace.chatData.composers.allComposers &&
    workspace.chatData.composers.allComposers.length > 0;
  const hasAgents =
    workspace.chatData.agents && workspace.chatData.agents.length > 0;

  const workspaceName = workspace.workspaceInfo.folder
    ? path.basename(workspace.workspaceInfo.folder)
    : workspace.workspaceInfo.id;

  if (!hasChatTabs && !hasComposers && !hasAgents) {
    console.log("Skipping empty workspace:", workspaceName);
    return null;
  }

  console.log("Processing workspace:", workspaceName);

  // Create workspace directories for markdown and html only
  const formats = ["html", "markdown"];
  for (const format of formats) {
    await fs.mkdir(path.join(outputDir, format, workspaceName), {
      recursive: true,
    });
  }

  // Prepare workspace JSON data
  const workspaceData = {
    workspace: workspaceName,
    workspaceInfo: workspace.workspaceInfo,
    chats: [],
    composers: [],
    agents: [],
  };

  // Export chat tabs
  if (hasChatTabs) {
    for (const tab of workspace.chatData.tabs) {
      await exportChatTab(
        tab,
        workspace,
        workspaceName,
        outputDir,
        workspaceData
      );
    }
  }

  // Export composers
  if (hasComposers) {
    for (const composer of workspace.chatData.composers.allComposers) {
      await exportComposer(
        composer,
        workspace,
        workspaceName,
        outputDir,
        workspaceData
      );
    }
  }

  // Export agents
  if (hasAgents) {
    for (const agent of workspace.chatData.agents) {
      await exportAgent(
        agent,
        workspace,
        workspaceName,
        outputDir,
        workspaceData
      );
    }
  }

  // Only save workspace JSON file if there's data
  if (workspaceData.chats.length > 0 || workspaceData.composers.length > 0) {
    const jsonPath = path.join(outputDir, "json", `${workspaceName}.json`);
    await fs.writeFile(
      jsonPath,
      JSON.stringify(workspaceData, null, 2),
      "utf-8"
    );
  }

  return workspaceData;
}

async function exportChatTab(
  tab,
  workspace,
  workspaceName,
  outputDir,
  workspaceData
) {
  const filename = getSafeFilename(tab.timestamp, tab.title);

  // Convert to markdown
  const markdown = convertToMarkdown(tab, workspace.workspaceInfo);

  // Save markdown version
  const mdPath = path.join(
    outputDir,
    "markdown",
    workspaceName,
    `${filename}.md`
  );
  await fs.writeFile(mdPath, markdown, "utf-8");

  // Convert to HTML and save
  const html = await convertToHtml(markdown);
  const htmlPath = path.join(
    outputDir,
    "html",
    workspaceName,
    `${filename}.html`
  );
  await fs.writeFile(htmlPath, html, "utf-8");

  // Add to workspace JSON data
  workspaceData.chats.push({
    title: tab.title,
    timestamp: tab.timestamp,
    conversation: tab.bubbles
      ? tab.bubbles.map((bubble) => ({
          role: bubble.type === "ai" ? "Cursor" : "Assistant",
          text: bubble.text || "",
          codeBlocks: bubble.codeBlocks || [],
        }))
      : [],
  });
}

async function exportComposer(
  composer,
  workspace,
  workspaceName,
  outputDir,
  workspaceData
) {
  // Skip empty composers
  if (
    !composer.text &&
    (!composer.conversation || composer.conversation.length === 0)
  ) {
    return;
  }

  // Use name if available, otherwise use composerId
  const title = composer.name || `Composer ${composer.composerId}`;
  const filename = composer.name
    ? getSafeFilename(composer.lastUpdatedAt || Date.now(), composer.name)
    : `composer-${composer.composerId}`;

  // Create a chat-like object for the composer to reuse convertToMarkdown
  const composerData = {
    title: title,
    bubbles: composer.conversation.map((msg) => ({
      type: msg.type === 1 ? "user" : "ai",
      text: msg.text || "",
      codeBlocks: msg.suggestedCodeBlocks || [],
    })),
  };

  // Convert to markdown
  const markdown = convertToMarkdown(composerData, workspace.workspaceInfo);

  // Save markdown version
  const mdPath = path.join(
    outputDir,
    "markdown",
    workspaceName,
    `${filename}.md`
  );
  await fs.writeFile(mdPath, markdown, "utf-8");

  // Convert to HTML and save
  const html = await convertToHtml(markdown);
  const htmlPath = path.join(
    outputDir,
    "html",
    workspaceName,
    `${filename}.html`
  );
  await fs.writeFile(htmlPath, html, "utf-8");

  // Add to workspace JSON data
  workspaceData.composers.push({
    title: title,
    composerId: composer.composerId,
    lastUpdatedAt: composer.lastUpdatedAt,
    conversation: composer.conversation.map((msg) => ({
      role: msg.type === 1 ? "User" : "Cursor",
      text: msg.text || "",
      codeBlocks: msg.suggestedCodeBlocks || [],
    })),
  });
}

async function exportAgent(
  agentData,
  workspace,
  workspaceName,
  outputDir,
  workspaceData
) {
  // Minimal normalization: treat agent conversation like chat
  const title = agentData.name || agentData.agentKey || "Agent Conversation";
  const timestamp = agentData.lastUpdatedAt || Date.now();
  const filename = getSafeFilename(timestamp, title);

  const chatLike = {
    title: title,
    bubbles: (agentData.conversation || agentData.messages || []).map(
      (msg) => ({
        type: msg.type === 1 || msg.role === "user" ? "user" : "ai",
        text: msg.text || msg.content || "",
        codeBlocks: msg.suggestedCodeBlocks || msg.codeBlocks || [],
      })
    ),
  };

  const markdown = convertToMarkdown(chatLike, workspace.workspaceInfo);
  const mdPath = path.join(
    outputDir,
    "markdown",
    workspaceName,
    `${filename}.md`
  );
  await fs.writeFile(mdPath, markdown, "utf-8");

  const html = await convertToHtml(markdown);
  const htmlPath = path.join(
    outputDir,
    "html",
    workspaceName,
    `${filename}.html`
  );
  await fs.writeFile(htmlPath, html, "utf-8");

  workspaceData.agents.push({
    title,
    agentKey: agentData.agentKey,
    lastUpdatedAt: agentData.lastUpdatedAt,
    conversation: (agentData.conversation || agentData.messages || []).map(
      (msg) => ({
        role: msg.type === 1 || msg.role === "user" ? "User" : "Cursor",
        text: msg.text || msg.content || "",
        codeBlocks: msg.suggestedCodeBlocks || msg.codeBlocks || [],
      })
    ),
  });
}

async function exportAllWorkspaces(chatHistory, outputDir) {
  await createExportDirectories(outputDir);

  const results = [];
  for (const workspace of chatHistory) {
    const workspaceData = await exportWorkspace(workspace, outputDir);
    results.push(workspaceData);
  }

  return results;
}

module.exports = {
  exportAllWorkspaces,
};
