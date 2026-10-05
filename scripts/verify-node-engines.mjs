import assert from "node:assert/strict";
import fs from "node:fs";

const supported = "^22.12.0 || ^24.0.0 || >=26.0.0";
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lockfile = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");

assert.equal(packageJson.engines.node, supported, "package.json must not advertise unsupported Node majors");
assert.equal(lockfile.packages[""].engines.node, supported, "lockfile root engine contract must match package.json");
assert.equal(lockfile.packages["node_modules/vitest"].engines.node, supported, "project engine contract must match locked Vitest support");
assert.match(readme, /Node\.js 22\.12\.x, 24\.x, or 26\+/, "README prerequisites must state the supported Node majors");

console.log(`Node engine contract verified: ${supported}`);
