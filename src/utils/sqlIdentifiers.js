const SQL_IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

export function assertAllowlistedIdentifier(identifier, allowlist, label = 'SQL identifier') {
    if (typeof identifier !== 'string' || identifier.trim().length === 0) {
        throw new Error(`${label} must be a non-empty string`);
    }

    if (!SQL_IDENTIFIER_PATTERN.test(identifier)) {
        throw new Error(`${label} contains unsafe characters: ${identifier}`);
    }

    if (!allowlist.has(identifier)) {
        throw new Error(`${label} is not in the allowlist: ${identifier}`);
    }

    return identifier;
}

export function quoteIdentifier(identifier) {
    return `"${identifier}"`;
}
