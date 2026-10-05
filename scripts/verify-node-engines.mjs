import assert from "node:assert/strict";
import fs from "node:fs";

const supported = "^22.13.0 || ^24.0.0 || >=26.0.0";
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lockfile = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");

assert.equal(packageJson.engines.node, supported, "package.json must not advertise unsupported Node majors");
assert.equal(lockfile.packages[""].engines.node, supported, "lockfile root engine contract must match package.json");
const vitestEngines = lockfile.packages["node_modules/vitest"].engines.node;
const jsdomEngines = lockfile.packages["node_modules/jsdom"].engines.node;
assert.equal(vitestEngines, "^22.12.0 || ^24.0.0 || >=26.0.0", "locked Vitest engine range changed; review the project contract");
assert.equal(jsdomEngines, "^20.19.0 || ^22.13.0 || >=24.0.0", "locked jsdom engine range changed; review the project contract");
assert.match(readme, /Node\.js 22\.13\.x, 24\.x, or 26\+/, "README prerequisites must state the supported Node majors");

function supportsProject(version) {
  const [major, minor] = version.split(".").map(Number);
  return (major === 22 && minor >= 13) || major === 24 || major >= 26;
}

for (const version of ["22.13.0", "24.0.0", "26.0.0"]) assert.equal(supportsProject(version), true, `${version} should remain supported`);
for (const version of ["22.12.0", "23.0.0", "25.0.0"]) assert.equal(supportsProject(version), false, `${version} must not be advertised`);

console.log(`Node engine contract verified: ${supported}`);
