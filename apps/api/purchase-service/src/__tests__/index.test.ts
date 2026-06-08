import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 1. Mock the app factory module so we don't start a real server instance
vi.mock("../app.js", () => {
    const mockListen = vi.fn().mockResolvedValue("http://0.0.0.0:3002");
    const mockLog = { error: vi.fn() };
    const mockApp = {
        listen: mockListen,
        log: mockLog,
    };

    return {
        buildApp: vi.fn().mockReturnValue(mockApp),
    };
});

describe("Server Entry Point", () => {
    let buildAppMock: any;
    let mockAppInstance: any;
    let originalEnv: NodeJS.ProcessEnv;
    let exitSpy: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules(); // Empties the module cache so the entry file re-executes on import

        // Save original environment variables and process spy hooks
        originalEnv = { ...process.env };
        exitSpy = vi.spyOn(process, "exit").mockImplementation((() => { }) as any);

        // Grab references to our mocked functions
        const appModule = await import("../app.js");
        buildAppMock = appModule.buildApp;
        mockAppInstance = buildAppMock();
    });

    afterEach(() => {
        // Restore original process environment variables
        process.env = originalEnv;
        exitSpy.mockRestore();
    });

    it("should initialize the app and listen on the default port 3002", async () => {
        delete process.env["PORT"]; // Ensure fallback is utilized

        // Act: Dynamically import the file to trigger its execution block
        await import("./server.js"); // Adjust to match the actual name of this entry file

        // Assert
        expect(buildAppMock).toHaveBeenCalledTimes(1);
        expect(mockAppInstance.listen).toHaveBeenCalledWith({
            port: 3002,
            host: "0.0.0.0",
        });
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it("should respect custom configuration supplied via PORT environment variable", async () => {
        process.env["PORT"] = "8080";

        await import("./server.js");

        expect(mockAppInstance.listen).toHaveBeenCalledWith({
            port: 8080,
            host: "0.0.0.0",
        });
    });

    it("should log errors and terminate the process if app.listen fails", async () => {
        const customError = new Error("Address already in use");
        mockAppInstance.listen.mockRejectedValueOnce(customError);

        await import("./server.js");

        // Assert that the system accurately logged the thrown rejection string
        expect(mockAppInstance.log.error).toHaveBeenCalledWith(customError);
        // Assert process.exit(1) was executed safely
        expect(exitSpy).toHaveBeenCalledWith(1);
    });
});