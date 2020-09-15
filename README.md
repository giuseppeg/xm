# ₪ xm - extensible HTML

xm is a tiny compiler for HTML that adds

- `<import>` tag to inline external HTML files
- `<slot>` and `<fill>` tags to define slots and fill them with content
- `<markdown>` tag to portal into Markdown

<p id="screenshot-1" align="center">
  <img src="https://user-images.githubusercontent.com/711311/90286174-9de82c80-de75-11ea-89b2-b8e0fd6c7078.png" width="50%" alt="screenshot of an html template with slots">
</p>
<p id="screenshot-2" align="center">
  <img src="https://user-images.githubusercontent.com/711311/90276504-4ee5cb80-de64-11ea-8ebd-99394ff66297.png" width="100%" alt="screenshot of an html page that imports the previous example and fills the slots">
</p>

xm CLI comes with a **dev mode** that compiles and serves built HTML.

Furthermore xm is built on top of [posthtml-cli](https://posthtml.org/#/cli) and therefore it is [extensible](https://posthtml.org/#/cli?id=options).

## Install

```
npm i -g xm
```

### Usage

```
Usage: xm <command> [options]

Commands:

  dev     Compiles HTML files on change and serves the root folder
  build   Compiles the HTML files once
  help    Displays help

Options:

  --root       Folder to complile (default ./)
  --output     Output (destination) folder. This is necessary only when using xm build
  --htmlOnly   Compile and copy only the built HTML files
```

#### `<import>` element

Allows to inline (import) HTML files into the current one.

```html
<import href="file.html" />
```

Paths are relative.

```html
<!-- src/folder/index.html -->

<import href="file.html" />
<!-- file.html -> src/folder/file.html -->
```

You can prefix paths with `/` to make them absolute i.e. relative to the `--root` value.

```
$ xm build --root ./src
# <import href="file.html" />
# -> ./src/file.html
```

#### Importing markdown files

xm supports importing `.md` (markdown) files too. When importing such files the front matter declarations are converted to `fill` elements.

```html
<style>
  /* theme */
</style>
<import href="README.md" />
```

💡 This feature can be used to generate styled docs sites for your open source project!

#### `<slot>` and `<fill>` elements

HTML files can define `slot` elements with an attribute `name`. slots can be filled when importing HTML files using the `fill` tag.

```html
<!-- base.html -->

<!DOCTYPE html>
<title><slot name="title"></slot></title>
<main>
  <slot name="main"></slot>
</main>

<!-- about.html -->

<import href="base.html">
  <fill name="title">About</fill>
  <fill name="main">
    <h1>About</h1>
    <p>welcome</p>
  </fill>
</import>
<footer>Unique to this page</footer>

<!-- about.html (compiled with xm) -->

<!DOCTYPE html>
<title>About</title>
<main>
  <h1>About</h1>
  <p>welcome</p>
</main>
```

You can also define a special unnamed `slot` that will be filled with the `import` children that are not `fill` tags:

```html
<!-- base.html -->

<slot></slot>
<footer><slot name="footer"></slot></footer>

<!-- about.html -->

<import href="base.html">
  <fill name="footer">good bye</fill>
  hello
  <p>friend</p>
</import>

<!-- about.html (compiled with xm) -->

hello
<p>friend</p>
<footer>good bye</footer>
```

#### Credits

- [Ivan Demidov](https://twitter.com/Scrum_) for helping me out with PRs and PostHTML
- [askucher](https://github.com/askucher) for transferring ownership of the `xm` package
