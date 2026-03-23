import OpenAI from "openai";
import {
  buildProductionAssetRelativePath,
  buildProductionAssetUrl,
  writeProductionAssetBuffer
} from "@/lib/services/production-assets";

export interface GeneratedImageAsset {
  status: "done" | "failed";
  provider: string;
  model: string;
  note: string;
  previewUrl?: string;
}

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("未检测到 OPENAI_API_KEY");
  }

  return new OpenAI({
    apiKey
  });
}

export async function generateOpenAiProductionImage(input: {
  packId: string;
  jobId: string;
  prompt: string;
}): Promise<GeneratedImageAsset> {
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1.5";

  try {
    const openai = getOpenAiClient();
    const response = await openai.images.generate({
      model,
      prompt: input.prompt,
      size: "1024x1536",
      quality: "medium"
    });

    const item = response.data?.[0] as
      | {
          b64_json?: string;
          url?: string;
        }
      | undefined;

    let buffer: Buffer | null = null;

    if (item?.b64_json) {
      buffer = Buffer.from(item.b64_json, "base64");
    } else if (item?.url) {
      const imageResponse = await fetch(item.url);

      if (!imageResponse.ok) {
        throw new Error(`图片下载失败: ${imageResponse.status}`);
      }

      buffer = Buffer.from(await imageResponse.arrayBuffer());
    }

    if (!buffer) {
      throw new Error("图片生成结果为空");
    }

    const relativePath = buildProductionAssetRelativePath(input.packId, input.jobId, "cover.png");
    await writeProductionAssetBuffer(relativePath, buffer);

    return {
      status: "done",
      provider: "OpenAI Images",
      model,
      note: "已生成真实封面图资产并写入本地运行目录。",
      previewUrl: buildProductionAssetUrl(relativePath)
    };
  } catch (error) {
    return {
      status: "failed",
      provider: "OpenAI Images",
      model,
      note: error instanceof Error ? error.message : "图片生成失败"
    };
  }
}
