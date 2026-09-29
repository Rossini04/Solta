import { ApiError, getFile, handle, storage, availableFile } from "./banco.js";
import { fileAccess, identity } from "./acesso.js";
async function download(request, context, head = false) {
    return handle(async () => {
        const file = await getFile((await context.params).id);
    availableFile(file);
        await fileAccess(request, file, await identity(request));
        const { bucket } = storage();
        const metadata = await bucket.head(`files/${file.id}`);
        if (!metadata)
            throw new ApiError(404, "Arquivo não encontrado.");
        const headers = new Headers({ "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Cache-Control": "no-store", "Accept-Ranges": "bytes", "ETag": metadata.httpEtag });
        let offset = 0, length = metadata.size, status = 200;
        const range = request.headers.get("range"), ifRange = request.headers.get("if-range");
        if (!head && range && (!ifRange || ifRange === metadata.httpEtag)) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range);
            if (!match || (!match[1] && !match[2]))
                return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${metadata.size}` } });
            const start = match[1] ? Number(match[1]) : Math.max(0, metadata.size - Number(match[2]));
            const end = match[1] && match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1;
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= metadata.size)
                return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${metadata.size}` } });
            offset = start;
            length = end - start + 1;
            status = 206;
            headers.set("Content-Range", `bytes ${start}-${end}/${metadata.size}`);
        }
        headers.set("Content-Length", String(length));
        if (head)
            return new Response(null, { headers });
        const object = await bucket.get(`files/${file.id}`, status === 206 ? { range: { offset, length } } : undefined);
        if (!object)
            throw new ApiError(404, "Arquivo não encontrado.");
        return new Response(object.body, { status, headers });
    });
}
export function GET(request, context) { return download(request, context); }
export function HEAD(request, context) { return download(request, context, true); }
