import { createClient } from "@/lib/supabase/client";
import { prepareChatUpload, type ChatAttachment } from "@/lib/chat-attachments";

// Validates through a server action, then uploads straight from the browser
// to Storage with the signed token.
export async function uploadChatAttachment(file: File, scope: string): Promise<ChatAttachment> {
  const prepared = await prepareChatUpload({ name: file.name, size: file.size, type: file.type, scope });

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(prepared.bucket)
    .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: prepared.contentType });

  if (error) {
    throw new Error(error.message);
  }

  return { url: prepared.publicUrl, type: prepared.contentType, name: file.name, size: file.size };
}
