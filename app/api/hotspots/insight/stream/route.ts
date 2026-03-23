import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireApiAccess } from "@/lib/auth/api-guard";
import { canUseHotspotInsight } from "@/lib/auth/permissions";
import { getHotspotSignals } from "@/lib/data";
import { generateHotspotInsightStream } from "@/lib/services/hotspot-insight";
import { formatServerSentEvent } from "@/lib/shared/server-sent-events";

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiAccess(request, {
      authorize: canUseHotspotInsight,
      requireWorkspace: true
    });

    if (!access.ok) {
      return access.response;
    }

    const { viewer } = access;
    const body = (await request.json()) as {
      hotspotId?: string;
    };

    if (!body.hotspotId) {
      return NextResponse.json(
        {
          error: "缺少热点 ID"
        },
        {
          status: 400
        }
      );
    }

    const hotspot = (await getHotspotSignals()).find((item) => item.id === body.hotspotId);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          try {
            for await (const event of generateHotspotInsightStream(body.hotspotId!)) {
              if (event.type === "complete" && event.insight) {
                await writeAuditLog({
                  workspaceId: viewer.currentWorkspace?.id,
                  actorUserId: viewer.isAuthenticated ? viewer.user.id : undefined,
                  actorDisplayName: viewer.user.displayName,
                  actorEmail: viewer.user.email,
                  entityType: "hotspot",
                  entityId: body.hotspotId,
                  action: "hotspot.insight_generated",
                  payload: {
                    hotspotTitle: hotspot?.title,
                    source: hotspot?.source,
                    recommendedFormat: event.insight.recommendedFormat,
                    planningScore: event.insight.planningScore
                  }
                });
              }

              const clientEvent =
                event.type === "complete" && event.insight
                  ? {
                      type: "complete" as const,
                      insight: {
                        productFocus: event.insight.productFocus,
                        connectionPoint: event.insight.connectionPoint,
                        communicationStrategy: event.insight.communicationStrategy,
                        planningDirection: event.insight.planningDirection,
                        recommendedFormat: event.insight.recommendedFormat,
                        planningScore: event.insight.planningScore,
                        planningComment: event.insight.planningComment,
                        riskNote: event.insight.riskNote
                      }
                    }
                  : event;

              controller.enqueue(
                encoder.encode(
                  formatServerSentEvent({
                    event: event.type,
                    data: JSON.stringify(clientEvent)
                  })
                )
              );
            }
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                formatServerSentEvent({
                  event: "error",
                  data: JSON.stringify({
                    type: "error",
                    error: error instanceof Error ? error.message : "生成深挖建议失败"
                  })
                })
              )
            );
          } finally {
            controller.close();
          }
        })();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "生成深挖建议失败"
      },
      {
        status: 500
      }
    );
  }
}
