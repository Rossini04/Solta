import { DocumentEditor } from "@/app/document-editor";
export const metadata = { title: "Documento compartilhado — Solta" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <DocumentEditor id={(await params).id} />; }
