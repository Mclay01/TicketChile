/** Best-effort minimization, not a claim to detect every secret or personal datum.
 * Explicit context allowlists remain the primary boundary. */
export function minimize(value:unknown):unknown {
 if(typeof value==='string')return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[correo omitido]').replace(/\+\d[\d ()-]{8,18}\d/g,'[teléfono omitido]').replace(/\b(?:sk|rk)_[A-Za-z0-9_-]{16,}\b/g,'[credencial omitida]');
 if(Array.isArray(value))return value.map(minimize);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,minimize(v)]));
 return value;
}
