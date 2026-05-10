import { describe, expect, test } from "bun:test"

const packageJson = await Bun.file("package.json").json()
const tsconfig = await Bun.file("tsconfig.json").json()
const autoPublishWorkflow = await Bun.file(
  ".github/workflows/auto-publish.yml",
).text()

describe("package publishing metadata", () => {
  test("declares built ESM entrypoints for npm and OpenCode", () => {
    expect(packageJson.type).toBe("module")
    expect(packageJson.main).toBe("./dist/index.js")
    expect(packageJson.types).toBe("./dist/index.d.ts")
    expect(packageJson.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./server": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    })
  })

  test("ships only publishable package files", () => {
    expect(packageJson.files).toEqual(["dist/", "README.md", "LICENSE"])
    expect(packageJson.scripts.build).toBe("tsup && tsc --emitDeclarationOnly")
    expect(packageJson.scripts.prepublishOnly).toBe("bun run check:package")
    expect(packageJson.publishConfig).toEqual({ access: "public" })
  })

  test("generates declarations for the dist package", () => {
    expect(tsconfig.compilerOptions.declaration).toBe(true)
    expect(tsconfig.compilerOptions.declarationMap).toBe(true)
    expect(tsconfig.compilerOptions.outDir).toBe("./dist")
    expect(tsconfig.compilerOptions.noEmit).toBeUndefined()
  })

  test("includes CI and npm publishing workflows", async () => {
    expect(await Bun.file(".github/workflows/pr-checks.yml").exists()).toBe(
      true,
    )
    expect(await Bun.file(".github/workflows/auto-publish.yml").exists()).toBe(
      true,
    )
    expect(await Bun.file("README.md").exists()).toBe(true)
    expect(await Bun.file("LICENSE").exists()).toBe(true)
  })

  test("publishes only after a matching git tag is pushed", () => {
    expect(autoPublishWorkflow).toContain("workflow_dispatch:")
    expect(autoPublishWorkflow).toContain("version:")
    expect(autoPublishWorkflow).toContain("required: true")
    expect(autoPublishWorkflow).toContain("skip_publish")

    const verifyPackage = autoPublishWorkflow.indexOf("name: Verify package")
    const createTag = autoPublishWorkflow.indexOf("name: Create and push tag")
    const publishNpm = autoPublishWorkflow.indexOf("name: Publish to npm")
    const createRelease = autoPublishWorkflow.indexOf(
      "name: Create GitHub Release",
    )

    expect(verifyPackage).toBeGreaterThan(-1)
    expect(createTag).toBeGreaterThan(verifyPackage)
    expect(publishNpm).toBeGreaterThan(createTag)
    expect(createRelease).toBeGreaterThan(publishNpm)
  })
})
