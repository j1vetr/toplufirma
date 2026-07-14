import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  "data-testid"?: string;
}

export function RichTextEditor({ value, onChange, placeholder, className, minHeight = 80 }: RichTextEditorProps) {
  const isSelfChange = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "",
    editorProps: {
      attributes: { class: "tiptap outline-none text-sm" },
    },
    onUpdate: ({ editor }) => {
      isSelfChange.current = true;
      const html = editor.isEmpty ? "" : editor.getHTML();
      onChange(html);
      setTimeout(() => { isSelfChange.current = false; }, 0);
    },
  });

  useEffect(() => {
    if (isSelfChange.current || !editor) return;
    const next = value || "";
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, false);
    }
  }, [value, editor]);

  const btnClass = (active?: boolean) =>
    cn(
      "h-6 w-6 flex items-center justify-center rounded-sm transition-colors",
      "text-muted-foreground hover:text-foreground hover:bg-muted",
      active && "bg-muted text-foreground",
    );

  return (
    <div className={cn("border border-input bg-transparent", className)}>
      <div className="flex items-center gap-0.5 border-b px-2 py-1 bg-muted/30">
        <button
          type="button"
          title="Kalın"
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
          className={btnClass(editor?.isActive("bold"))}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="İtalik"
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
          className={btnClass(editor?.isActive("italic"))}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <div className="h-4 w-px bg-border mx-0.5" />
        <button
          type="button"
          title="Madde işareti listesi"
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
          className={btnClass(editor?.isActive("bulletList"))}
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>
      <EditorContent
        editor={editor}
        style={{ minHeight }}
        className="px-3 py-2 overflow-y-auto"
      />
    </div>
  );
}
