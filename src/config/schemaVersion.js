const rawSchemaVersion = Number.parseInt(process.env.SCHEMA_VERSION || '1', 10);

export const EXPECTED_SCHEMA_VERSION = Number.isInteger(rawSchemaVersion) && rawSchemaVersion > 0
    ? rawSchemaVersion
    : 1;

export const EXPECTED_SCHEMA_LABEL = process.env.SCHEMA_VERSION_LABEL || `baseline-v${EXPECTED_SCHEMA_VERSION}`;
