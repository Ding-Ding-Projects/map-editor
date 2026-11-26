import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Rich text is edited with the one bundled editor only. These checks fail if a hand-made editable
// area or a second rich-text library is brought in.
const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]);

describe('rich text editing', () => {
  it('has no hand-made editable area anywhere in the source', () => {
    const hits = files('src').filter((f) => /\.(ts|html|css)$/.test(f)).filter((f) => /contenteditable|contentEditable|designMode|execCommand\(/.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('depends on the bundled editor and on no other rich-text library', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps).toContain('tinymce');
    expect(deps.filter((d) => /quill|ckeditor|tiptap|prosemirror|slate|draft-js|lexical|trix|medium-editor|summernote|froala|editor\.js|@editorjs/i.test(d))).toEqual([]);
    expect(fs.readFileSync('src/ui/notes.ts', 'utf8')).toMatch(/tinymce/);
  });
});
