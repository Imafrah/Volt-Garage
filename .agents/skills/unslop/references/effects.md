# Effects

Code treatments that turn an image into something made for this page. They are optional. Use one only when it fits the character in the direction, on the main visual only, and never as decoration on other elements.

## Glyphs

Draw the image as a grid of characters, brightness picking the character. It works best when the characters come from the product's own material.

- Money, invoices, finance: `. : 1 7 4 0 8 $ %`
- Code, developer tools: `. : / { } < > = #`
- Music: note names like `c d e g a` and `♭ ♯`
- Writing, reading: lowercase letters of a word from the product
- Data, monitoring: `. · : | + ▪`

Keep the cell between 6 and 10px, use the mono from the type choice, and color the glyphs from the image or from the ramp.

## Halftone dots

Dots on a grid whose size follows brightness. Suits editorial, print and crafted characters.

## Dithering

An ordered or error diffusion dither into two or three colors from the ramp. Suits retro, technical and playful characters.

## Duotone

Map the image's brightness onto two colors, the darkest surface of the ramp and the accent or the primary text color.

## Performance

- Read pixels once when the image loads. Never call `getImageData` inside the animation loop.
- Prepare glyph atlases and tinted cells ahead of time and draw them with `drawImage`.
- Animate at 8 to 12 steps per second, not 60.
- Pause when the canvas is off screen.
- Size the canvas for the device pixel ratio, but cap it at 2.

---

Part of unslop by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0. Keep this credit in copies and adaptations.
