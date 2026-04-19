export interface AppVersion {
  version: string;
  commit: string;
  commitShort: string;
}

export function getAppVersion(): AppVersion {
  const version = process.env.APP_VERSION ?? "dev";
  const commit = process.env.APP_COMMIT ?? "dev";
  const commitShort = commit === "dev" ? "dev" : commit.slice(0, 7);
  return { version, commit, commitShort };
}
