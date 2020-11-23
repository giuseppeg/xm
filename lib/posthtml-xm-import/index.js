// Based on https://github.com/posthtml/posthtml-extend
const fs = require("fs");
const path = require("path");
const util = require("util");
const parseToPostHtml = require("posthtml-parser");
const { match, walk } = require("posthtml/lib/api");
const fm = require("front-matter");
const glob = require("glob").sync;
const clone = require("just-clone");

const UNNAMED = "__xm-import-content__";

module.exports = (options = {}) => {
  return (tree) => {
    options.encoding = options.encoding || "utf8";
    options.root = options.root || "./";
    options.plugins = options.plugins || [];
    options.strict = Object.prototype.hasOwnProperty.call(options, "strict")
      ? !!options.strict
      : true;

    enableSlotsInTitle(tree, options);

    tree = handleImportNodes(tree, options, tree.messages);

    tree.markdownNodes.forEach(([importNode, markdownTree]) => {
      importNode.content = markdownTree;
    });

    expandFillCollections(tree);

    const slotsFills = select(tree, ["slot", "fill"]);
    fillSlots(slotsFills.slot, slotsFills.fill);

    // cleanup
    walk.call(tree, (node) => {
      if (!node.tag || (node.attrs && node.attrs.name === UNNAMED)) {
        return node;
      }

      // remove unfilled slots
      if (node.tag === "slot") {
        node.tag = false;
        node.content = node.content || [];
        return node;
      }

      // remove fill tags
      if (node.tag === "fill") {
        node.tag = false;
        node.content = [];
        return node;
      }

      // remove slot: from attributes
      if (node.attrs) {
        let newAttrs = {};
        for (let attr in node.attrs) {
          if (attr.startsWith("slot:")) {
            newAttrs[attr.slice(5)] = node.attrs[attr];
          } else {
            newAttrs[attr] = node.attrs[attr];
          }
        }
        node.attrs = newAttrs;
        return node;
      }

      return node;
    });

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
      if (
        !importNode.attrs ||
        (!importNode.attrs.src && !importNode.attrs.href)
      ) {
        throw error('<import> has no "src"');
      }
      const url = importNode.attrs.src || importNode.attrs.href;
      const importPath = url.startsWith("/")
        ? path.resolve(options.root, url.slice(1))
        : path.resolve(path.dirname(tree.options.from), url);
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
        enableSlotsInTitle(importedTree);
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
    slotNode.content = fillNodes[UNNAMED].content.filter((node, index, src) => {
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
    });
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
        if (slotNode.tag && slotNode.tag !== "slot") {
          // attribute <foo slot:attr="{value}">
          for (let attr in slotNode.attrs) {
            if (attr.startsWith("slot:")) {
              slotNode.attrs[attr] = slotNode.attrs[attr].replace(
                new RegExp(`{${name}}`),
                (placeholder) => {
                  return fillNode.content[0].trim();
                }
              );
            }
          }
        } else {
          // regular <slot>
          slotNode.content = fillNode.content;
          slotNode.tag = false;
        }
      });
    });
  }
}

function select(content = [], tags) {
  const isSingleTag = tags.length === 1;
  let nodes = isSingleTag
    ? {}
    : tags.reduce((nodes, tag) => {
        nodes[tag] = {};
        return nodes;
      }, {});

  const selectingTags = new Set(tags);

  walk.call(content, (node) => {
    if (!selectingTags.has(node.tag)) {
      if (node.attrs && selectingTags.has("slot")) {
        // attribute <foo slot:attr="{value}">
        Object.keys(node.attrs).forEach((attr) => {
          if (!attr.startsWith("slot:") && node.attrs[attr].includes("{")) {
            return;
          }
          node.attrs[attr].replace(/{(.*?)}/g, (_, name) => {
            if (!name) return _;
            if (isSingleTag) {
              nodes[name] = nodes[name] || [];
              nodes[name].push(node);
            } else {
              nodes["slot"][name] = nodes["slot"][name] || [];
              nodes["slot"][name].push(node);
            }
          });
        });
      }
      return node;
    }
    if (node.tag === "fill") {
      if (!node.attrs || (!node.attrs.name && !node.attrs.collection)) {
        console.log(node);
        throw error('<fill> has no "name"');
      }
      if (node.attrs.collection) {
        return node;
      }
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

function enableSlotsInTitle(tree) {
  match.call(tree, { tag: "title" }, (node) => {
    if (
      node.content &&
      typeof node.content[0] === "string" &&
      node.content[0].includes("</slot")
    ) {
      node.content[0] = parseToPostHtml(node.content[0])[0];
    }
    return node;
  });
}

// <fill collection="..."> collections
// collection can be
// * a string of serializable JSON (array of flat objects) for inline collections
// * a glob pattern
// * a path to a JSON file (array of flat objects)
// * a path to a JS module that exports
//   - array of flat objects
//   - a function that returns an array of flat objects
function expandFillCollections(tree) {
  match.call(tree, { tag: "fill" }, (node) => {
    if (!node.attrs || !node.attrs.collection) {
      return node;
    }

    let src = node.attrs.collection;
    let root;
    if (src.startsWith("/")) {
      root = options.root;
      src = src.slice(1);
    } else {
      root = path.dirname(tree.options.from);
    }

    let items = [];
    if (src.includes("*")) {
      items = glob(src, { cwd: root })
        .map((src) => {
          const srcPath = path.resolve(root, src);
          let permalink = path.parse(srcPath.slice(path.resolve(root).length));
          permalink =
            permalink.name === "index"
              ? permalink.dir
              : path.join(permalink.dir, permalink.name);
          let source = fs.readFileSync(srcPath, "utf-8");
          let time;
          if (src.endsWith(".md")) {
            const { attributes: frontmatter } = fm(source);
            source = "";
            for (attr in frontmatter) {
              if (attr === "date") {
                time = frontmatter.date;
              }
              source += `<fill name="${attr}">${frontmatter[attr]}</fill>\n`;
            }
          }
          // time is used to sort fills by last modified date DESC
          try {
            if (!time) {
              time = fs.statSync(srcPath).mtime;
            }
            time = new Date(time).getTime();
            if (isNaN(time)) throw new Error("invalid date");
          } catch (error) {
            time = Date.now();
          }
          const tree = parseToPostHtml(
            `<fill name="xm:permalink">${permalink}</fill>` + source
          );
          return [time, select(tree, ["fill"])];
        })
        .sort((a, b) => (a[0] > b[0] ? -1 : 1))
        .map((item) => item[1]);
    } else if (src.endsWith(".json")) {
      items = require(path.resolve(root, src)).map((item) => {
        const tree = parseToPostHtml(
          Object.entries(item).map(([n, v]) => `<fill name="${n}">${v}</fill>`)
        );
        return select(tree, ["fill"]);
      });
    } else if (src.endsWith(".js")) {
      let m = require(path.resolve(root, src));
      m = m.default || m;
      if (typeof m === "function") {
        items = m();
      } else {
        items = m;
      }
      items = items.map((item) => {
        const tree = parseToPostHtml(
          Object.entries(item).map(([n, v]) => `<fill name="${n}">${v}</fill>`)
        );
        return select(tree, ["fill"]);
      });
    } else {
      try {
        items = JSON.parse(src).map((item) => {
          const tree = parseToPostHtml(
            Object.entries(item).map(
              ([n, v]) => `<fill name="${n}">${v}</fill>`
            )
          );
          return select(tree, ["fill"]);
        });
      } catch (error) {
        throw error(
          `fill collection format "${node.attrs.collection}" not supported`
        );
      }
    }
    if (!Array.isArray(items)) {
      throw error(
        `fill collection "${node.attrs.collection}" did not resolve to an array of items`
      );
    }

    node.tag = false;
    node.content = items
      .map((fillNodes) => {
        const content = clone(node.content);
        const slotNodes = select(content, ["slot"]);
        fillSlots(slotNodes, fillNodes);
        return content;
      })
      .reduce((content, nodes) => content.concat(nodes), []);

    return node;
  });
}

function error() {
  const message = util.format.apply(util, arguments);
  return new Error("[xm] " + message);
}
