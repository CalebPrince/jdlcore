/**
 * Minimal, spec-correct 2D DOMMatrix polyfill for Node.js.
 *
 * pdf-parse (via pdfjs-dist) references the browser's `DOMMatrix` global for glyph/path
 * transforms on some PDFs (embedded fonts, certain graphics). No Node built-in provides
 * it, and the third-party `dommatrix`/`@thednp/dommatrix` npm packages both turned out to
 * be missing `preMultiplySelf`/`invertSelf` — methods pdfjs actually calls — so rather than
 * depend on an incomplete polyfill, this implements exactly the 2D affine-matrix subset
 * pdfjs needs, with standard matrix semantics (WHATWG Geometry Interfaces spec).
 *
 * Matrix layout (2D affine, homogeneous form):
 *   | a  c  e |
 *   | b  d  f |
 *   | 0  0  1 |
 */
export class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | string) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    }
    // A string (CSS transform) initializer isn't needed by pdfjs's usage; left as identity.
  }

  get is2D() {
    return true;
  }

  private static multiplyMatrices(m1: DOMMatrixPolyfill, m2: DOMMatrixPolyfill): DOMMatrixPolyfill {
    // Standard 2D affine matrix multiplication: result = m1 * m2.
    return new DOMMatrixPolyfill([
      m1.a * m2.a + m1.c * m2.b,
      m1.b * m2.a + m1.d * m2.b,
      m1.a * m2.c + m1.c * m2.d,
      m1.b * m2.c + m1.d * m2.d,
      m1.a * m2.e + m1.c * m2.f + m1.e,
      m1.b * m2.e + m1.d * m2.f + m1.f,
    ]);
  }

  multiply(other: DOMMatrixPolyfill): DOMMatrixPolyfill {
    return DOMMatrixPolyfill.multiplyMatrices(this, other);
  }

  multiplySelf(other: DOMMatrixPolyfill): this {
    const result = DOMMatrixPolyfill.multiplyMatrices(this, other);
    Object.assign(this, result);
    return this;
  }

  preMultiplySelf(other: DOMMatrixPolyfill): this {
    const result = DOMMatrixPolyfill.multiplyMatrices(other, this);
    Object.assign(this, result);
    return this;
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      // Per spec, a non-invertible matrix becomes all-NaN — callers treat this as "unusable"
      // rather than crashing, matching browser DOMMatrix behavior.
      this.a = this.b = this.c = this.d = this.e = this.f = NaN;
      return this;
    }
    const { a, b, c, d, e, f } = this;
    this.a = d / det;
    this.b = -b / det;
    this.c = -c / det;
    this.d = a / det;
    this.e = (c * f - d * e) / det;
    this.f = (b * e - a * f) / det;
    return this;
  }

  translate(tx: number, ty: number): DOMMatrixPolyfill {
    return this.multiply(new DOMMatrixPolyfill([1, 0, 0, 1, tx, ty]));
  }

  translateSelf(tx: number, ty: number): this {
    return this.multiplySelf(new DOMMatrixPolyfill([1, 0, 0, 1, tx, ty]));
  }

  scale(sx: number, sy: number = sx): DOMMatrixPolyfill {
    return this.multiply(new DOMMatrixPolyfill([sx, 0, 0, sy, 0, 0]));
  }

  scaleSelf(sx: number, sy: number = sx): this {
    return this.multiplySelf(new DOMMatrixPolyfill([sx, 0, 0, sy, 0, 0]));
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}
