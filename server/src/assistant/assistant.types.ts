import Anthropic from "@anthropic-ai/sdk";
import { AuthUser } from "../auth/auth-user";
import { UserRole } from "../db/schema";

/** JSON schema of a tool's input, as sent to Claude. */
export type InputSchema = Anthropic.Beta.BetaTool.InputSchema;

/** Tool input as Claude sent it; each tool checks the fields it uses. */
export type ToolInput = Record<string, unknown>;

/** A change the assistant wants to make, shown to the user before anything happens. */
export interface Proposal {
  title: string;
  /** One sentence, e.g. "Assign truck 12 and Jim Bell to SH-1A2B3C (Dallas → Chicago)". */
  summary: string;
  details: string[];
  /** Something the user should look at twice (a busy truck, a load that goes back to "edited"). */
  warnings: string[];
}

export interface ExecuteOptions {
  /** The user accepted the truck restrictions the API reported for this assignment. */
  acceptRestrictions?: boolean;
}

/** Something the web app does for the user, such as opening a page. */
export interface UiAction {
  type: "navigate";
  path: string;
  label: string;
}

interface BaseTool {
  name: string;
  description: string;
  input_schema: InputSchema;
  roles: UserRole[];
}

/** Looks something up; runs straight away and its result goes back to Claude. */
export interface ReadTool extends BaseTool {
  kind: "read";
  run(input: ToolInput, user: AuthUser): Promise<unknown>;
}

/** Changes data; only runs after the user confirms the proposal. */
export interface WriteTool extends BaseTool {
  kind: "write";
  /**
   * Checks the input and describes the change; throws an HttpException when it can't be done.
   * `input`, when returned, replaces what Claude sent (e.g. pinned to the load it was proposed for).
   */
  prepare(input: ToolInput, user: AuthUser): Promise<Proposal & { input?: ToolInput }>;
  execute(input: ToolInput, user: AuthUser, options: ExecuteOptions): Promise<ExecuteResult>;
}

/** Acts in the user's browser (navigation). */
export interface UiTool extends BaseTool {
  kind: "ui";
  action(input: ToolInput): UiAction;
}

export interface ExecuteResult {
  message: string;
  /** Where the user can see the result. */
  link?: UiAction;
}

export type AssistantTool = ReadTool | WriteTool | UiTool;
