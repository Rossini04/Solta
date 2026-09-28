import { FolderView } from "@/app/library";
export const metadata = { title: "Pasta — Solta" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <FolderView id={(await params).id} />; }
