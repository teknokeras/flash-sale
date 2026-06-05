import {
    DynamoDBClient,
    type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    PutCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = "purchases";

function buildClient(): DynamoDBDocumentClient {
    const config: DynamoDBClientConfig = {
        region: process.env["DYNAMO_REGION"] ?? "us-east-1",
    };

    // In local dev, point to DynamoDB Local container
    if (process.env["NODE_ENV"] === "local") {
        config.endpoint = process.env["DYNAMO_ENDPOINT"] ?? "http://localhost:8000";
        config.credentials = {
            accessKeyId: process.env["DYNAMO_ACCESS_KEY"] ?? "local",
            secretAccessKey: process.env["DYNAMO_SECRET_KEY"] ?? "local",
        };
    }

    return DynamoDBDocumentClient.from(new DynamoDBClient(config));
}

export const dynamo = buildClient();

// Attempt to write a purchase dedup record.
// Returns true if the write succeeded (user hasn't bought yet).
// Returns false if the condition failed (user already bought).
export async function claimPurchaseSlot(
    userId: string,
    saleId: string,
    requestId: string
): Promise<boolean> {
    const pk = `${userId}#${saleId}`;

    try {
        await dynamo.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    pk,
                    userId,
                    saleId,
                    requestId,
                    status: "reserved",
                    createdAt: new Date().toISOString(),
                },
                // The core guard — only succeeds if this key doesn't exist yet
                ConditionExpression: "attribute_not_exists(pk)",
            })
        );
        return true;
    } catch (err: unknown) {
        if (
            err instanceof Error &&
            err.name === "ConditionalCheckFailedException"
        ) {
            return false; // User already bought — expected path
        }
        throw err; // Unexpected error — re-throw
    }
}

// Roll back the DynamoDB record if inventory was 0 (sold out after claim).
// Called when Redis Lua returns -1 after a successful DynamoDB write.
export async function releasePurchaseSlot(
    userId: string,
    saleId: string
): Promise<void> {
    const pk = `${userId}#${saleId}`;
    await dynamo.send(
        new DeleteCommand({ TableName: TABLE_NAME, Key: { pk } })
    );
}