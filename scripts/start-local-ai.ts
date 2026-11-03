// Activa solo el proveedor local si no existe una decisión explícita previa.
process.env.AI_PROVIDER ||= 'ollama';
await import('../server/index.ts');
