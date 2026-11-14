import { notFound } from "next/navigation";
import { isSlug, readScriptRaw } from "@/lib/store";
import { Editor } from "@/components/Editor";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) notFound();
  const raw = readScriptRaw(slug);
  if (!raw) notFound();
  return <Editor slug={slug} initial={raw} />;
}
