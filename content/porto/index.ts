import "server-only";

import type { ExperienceContent } from "@/features/engine/types";
import { saude } from "./saude";

/** Every Porto experience. Read through server/content-repository, never directly from UI. */
export const portoExperiences: readonly ExperienceContent[] = [saude];
