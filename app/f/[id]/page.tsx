import { FileHub } from "@/app/file-hub";
export const metadata = { title: "Baixar arquivo — Solta" };
export default async function FilePage({ params }: { params: Promise<{ id: string }> }) { return <FileHub fileId={(await params).id} />; }
