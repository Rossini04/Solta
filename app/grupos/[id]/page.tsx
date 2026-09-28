import { Library } from "@/app/library";
export const metadata = { title: "Grupo — Solta" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <Library view="groups" groupId={(await params).id} />; }
