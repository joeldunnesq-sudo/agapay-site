declare module '*dompurify.es.mjs?v=3.4.14' {
  const DOMPurify: {
    sanitize(markup: string): string;
    sanitize(
      markup: string,
      options: {
        PARSER_MEDIA_TYPE: 'application/xhtml+xml';
        ALLOWED_NAMESPACES: string[];
        ALLOWED_TAGS: string[];
        ALLOWED_ATTR: string[];
        ADD_URI_SAFE_ATTR: string[];
        RETURN_DOM: true;
      }
    ): Element | null;
  };
  export default DOMPurify;
}
declare module '*pdf-lib-1.17.1.esm.min.js' {
  export interface PDFColor {
    type: string;
    red: number;
    green: number;
    blue: number;
  }
  export interface PDFFont {
    widthOfTextAtSize(text: string, size: number): number;
  }
  export interface PDFPage {
    drawText(text: string, options: { x: number; y: number; font: PDFFont; size: number; color: PDFColor }): void;
    drawLine(options: {
      start: { x: number; y: number };
      end: { x: number; y: number };
      thickness: number;
      color: PDFColor;
    }): void;
    drawRectangle(options: { x: number; y: number; width: number; height: number; color: PDFColor }): void;
  }
  export interface PDFDocumentInstance {
    registerFontkit(fontkit: unknown): void;
    embedFont(bytes: ArrayBuffer | Uint8Array, options: { subset: boolean }): Promise<PDFFont>;
    setTitle(value: string): void;
    setAuthor(value: string): void;
    setCreator(value: string): void;
    setSubject(value: string): void;
    addPage(size: [number, number]): PDFPage;
    getPages(): PDFPage[];
    save(): Promise<Uint8Array>;
  }
  export const PDFDocument: { create(): Promise<PDFDocumentInstance> };
  export function rgb(red: number, green: number, blue: number): PDFColor;
}
declare module '*fontkit-1.1.1.es.min.js' {
  const fontkit: unknown;
  export default fontkit;
}
