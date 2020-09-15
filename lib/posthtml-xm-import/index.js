// Based on https://github.com/posthtml/posthtml-extend
const fs = require("fs");
const path = require("path");
const util = require("util");
const parseToPostHtml = require("posthtml-parser");
const { match } = require("posthtml/lib/api");
const fm = require("front-matter");

const errors = {
  IMPORT_NO_HREF: '<import> has no "href"',
  FILL_NO_NAME: '<fill> has no "name"',
  UNEXPECTED_BLOCK: 'Unexpected block "%s"',
};

const UNNAMED = "__xm-import-content__";

module.exports = (options = {}) => {
  return (tree) => {
    options.encoding = options.encoding || "utf8";
    options.root = options.root || "./";
    options.plugins = options.plugins || [];
    options.strict = Object.prototype.hasOwnProperty.call(options, "strict")
      ? !!options.strict
      : true;

    tree = handleImportNodes(tree, options, tree.messages);

    tree.markdownNodes.forEach(([importNode, markdownTree]) => {
      importNode.content = markdownTree;
    });

    const slotsFills = select(tree, ["slot", "fill"]);
    fillSlots(slotsFills.slot, slotsFills.fill);

    for (let tag in slotsFills) {
      for (let name in slotsFills[tag]) {
        if (name === UNNAMED) {
          continue;
        }
        slotsFills[tag][name].forEach((node, index) => {
          node.tag = false;
          node.content = tag === "fill" ? [] : node.content || [];
        });
      }
    }

    delete tree.markdownNodes;
    return tree;
  };
};

function handleImportNodes(tree, options, messages) {
  const markdownNodes = [];
  match.call(
    applyPluginsToTree(tree, options.plugins),
    { tag: "import" },
    (importNode) => {
      if (!importNode.attrs || !importNode.attrs.href) {
        throw getError(errors.IMPORT_NO_HREF);
      }

      const importPath = importNode.attrs.href.startsWith("/")
        ? path.resolve(options.root, importNode.attrs.href.slice(1))
        : path.resolve(path.dirname(tree.options.from), importNode.attrs.href);
      const isMarkdown = importPath.endsWith(".md");
      let importedHtml = fs.readFileSync(importPath, options.encoding);

      let frontmatter = null;
      if (isMarkdown) {
        const result = fm(importedHtml);
        let fills = "";
        frontmatter = result.attributes;
        for (attr in result.attributes) {
          fills += `<fill name="${attr}">${result.attributes[attr]}</fill>\n`;
        }
        importedHtml = `${fills}<markdown></markdown>`;
        const markdownTree = parseToPostHtml(importedHtml);
        markdownTree[markdownTree.length - 1].content = [result.body.trim()];
        importNode.tag = false;
        markdownNodes.push([importNode, markdownTree]);
      } else {
        const importedTree = handleImportNodes(
          applyPluginsToTree(parseToPostHtml(importedHtml), options.plugins),
          options,
          messages
        );
        const slotNodes = select(importedTree, ["slot"]);
        const fillNodes = select(importNode.content, ["fill"]);
        fillNodes[UNNAMED] = importNode;
        fillSlots(slotNodes, fillNodes, options.strict);
        importNode.tag = false;
        importNode.content = importedTree;
      }

      messages.push({
        type: "dependency",
        file: importPath,
        from: options.from,
        frontmatter,
      });

      return importNode;
    }
  );

  tree.markdownNodes = markdownNodes;
  return tree;
}

function applyPluginsToTree(tree, plugins) {
  return plugins.reduce((tree, plugin) => (tree = plugin(tree)), tree);
}

function fillSlots(slotNodes, fillNodes, strictNames) {
  // Default UNNAMED <slot></slot>
  if (slotNodes[UNNAMED] && fillNodes[UNNAMED]) {
    let slotNode = slotNodes[UNNAMED][0];
    slotNode.content = mergeContent(
      fillNodes[UNNAMED].content.filter((node, index, src) => {
        if (node == null) {
          return node;
        }
        if (typeof node === "string") {
          const nextNode = src[index + 1];
          if (nextNode && nextNode.tag === "fill" && !node.trim()) {
            return false;
          }
          return true;
        }
        return node.tag !== "fill";
      }),
      slotNode.content,
      "replace"
    );
    fillNodes[UNNAMED].content = fillNodes[UNNAMED].content.filter(
      (node) => node && node.tag === "fill"
    );
    slotNode.tag = false;
  }

  for (let name in fillNodes) {
    let slotNode = slotNodes[name];
    if (!slotNode || slotNode.length === 0 || name === UNNAMED) {
      continue;
    }

    fillNodes[name].forEach((fillNode) => {
      (fillNode.content || []).some((node) => {
        if (node.tag === "fill") {
          throw new Error(
            "Found nested <fill> tag. Nested <fill> are not supported.\n\n" +
              ` <fill name="${fillNode.attrs.name}">\n` +
              `   <fill name="${node.attrs.name}"></fill>\n` +
              ` </fill>\n`
          );
        }
      });

      slotNode.forEach((slotNode) => {
        slotNode.content = mergeContent(
          fillNode.content,
          slotNode.content,
          getBlockType(fillNode)
        );
        slotNode.tag = false;
      });
    });
  }
}

function mergeContent(extendBlockContent, layoutBlockContent, extendBlockType) {
  extendBlockContent = extendBlockContent || [];
  layoutBlockContent = layoutBlockContent || [];

  switch (extendBlockType) {
    case "replace":
      layoutBlockContent = extendBlockContent;
      break;

    case "prepend":
      layoutBlockContent = extendBlockContent.concat(layoutBlockContent);
      break;

    case "append":
      layoutBlockContent = layoutBlockContent.concat(extendBlockContent);
      break;
  }

  return layoutBlockContent;
}

function getBlockType(blockNode) {
  let blockType = (blockNode.attrs && blockNode.attrs.type) || "";
  blockType = blockType.toLowerCase();
  if (["replace", "prepend", "append"].indexOf(blockType) === -1) {
    blockType = "replace";
  }

  return blockType;
}

function select(content = [], tags) {
  const isSingleTag = tags.length === 1;
  let nodes = isSingleTag
    ? {}
    : tags.reduce((nodes, tag) => {
        nodes[tag] = {};
        return nodes;
      }, {});
  match.call(content, tags.map((tag) => ({ tag: tag })), (node) => {
    if (node.tag === "fill" && (!node.attrs || !node.attrs.name)) {
      console.log(node);
      throw getError(errors.FILL_NO_NAME);
    }
    const name = node.attrs ? node.attrs.name : UNNAMED;
    if (isSingleTag) {
      nodes[name] = nodes[name] || [];
      nodes[name].push(node);
    } else {
      nodes[node.tag][name] = nodes[node.tag][name] || [];
      nodes[node.tag][name].push(node);
    }
    return node;
  });

  return nodes;
}

function getError() {
  const message = util.format.apply(util, arguments);
  return new Error("[xm-import] " + message);
}
