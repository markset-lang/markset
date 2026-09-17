---
markset: 0
---

# Figure

A figure wraps a single image, table, or code block with a caption. The argument is the caption; `width` accepts a percentage only, because the same source has to typeset to print. In the downgrade the content is followed by the caption in italics.

Give images alt text. The caption describes the figure's role in the document; the alt text describes the image.

## Attributes

| Attribute | Values | Default |
|---|---|---|
| `width` | A percentage from `1%` to `100%` | full width |
| `chart` | `line`, `bar`, `column` | unset |

`chart` asks for the figure's table to be drawn as a chart, and is only valid when the content is a table — a chart is drawn from data, and an image carries none. The picture is added in front of the table and never replaces it. See [charts](../charts/index.html).

The argument is the caption and may contain inline markup. Content must be exactly one block: a paragraph holding a single image, a table, or a code block.

**Downgrade:** the content, followed by the caption as an italic paragraph.

**Watch for:** `width` takes percentages only. No pixels and no absolute units, because the same source has to typeset to print, where a pixel means nothing. And when the content is a table the caption is emitted as the table's own `<caption>` rather than a `<figcaption>`, because that is the element a screen reader announces as the table's name.
