import { listVideos } from "@/lib/store";
import { Home } from "@/components/Home";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Home videos={listVideos()} />;
}
