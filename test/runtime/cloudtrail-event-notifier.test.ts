import {handler} from "../../lib/runtime/cloudtrail-event-notifier"
import * as path from "path"
import {S3Event} from "aws-lambda";
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import * as fs from "fs"
import {mockClient} from "aws-sdk-client-mock";
import {PublishBatchCommand, SNSClient} from "@aws-sdk/client-sns";

test("handler", () => {
    const event = {
        "Records": [
            {
                "eventVersion":"2.2",
                "eventSource":"aws:s3",
                "awsRegion":"us-west-2",
                "eventTime":"The time, in ISO-8601 format, for example, 1970-01-01T00:00:00.000Z, when Amazon S3 finished processing the request",
                "eventName":"event-type",
                "userIdentity":{
                    "principalId":"Amazon-customer-ID-of-the-user-who-caused-the-event"
                },
                "requestParameters":{
                    "sourceIPAddress":"ip-address-where-request-came-from"
                },
                "responseElements":{
                    "x-amz-request-id":"Amazon S3 generated request ID",
                    "x-amz-id-2":"Amazon S3 host that processed the request"
                },
                "s3":{
                    "s3SchemaVersion":"1.0",
                    "configurationId":"ID found in the bucket notification configuration",
                    "bucket":{
                        "name":"bucket-name",
                        "ownerIdentity":{
                            "principalId":"Amazon-customer-ID-of-the-bucket-owner"
                        },
                        "arn":"bucket-ARN"
                    },
                    "object":{
                        "key":"object-key",
                        "size":"object-size in bytes",
                        "eTag":"object eTag",
                        "versionId":"object version if bucket is versioning-enabled, otherwise null",
                        "sequencer": "a string representation of a hexadecimal value used to determine event sequence, only used with PUTs and DELETEs"
                    }
                },
                "glacierEventData": {
                    "restoreEventData": {
                        "lifecycleRestorationExpiryTime": "The time, in ISO-8601 format, for example, 1970-01-01T00:00:00.000Z, of Restore Expiry",
                        "lifecycleRestoreStorageClass": "Source storage class for restore"
                    }
                }
            }
        ]
    }
    const incomingEvent = JSON.parse(JSON.stringify(event)) as S3Event
    const s3Client =mockClient(S3Client)
    s3Client.on(GetObjectCommand).resolves({
        $metadata: {
            httpStatusCode: 200
        },
        Body:  fs.createReadStream(path.resolve("test","runtime","cloudtrail.json.gz"))
    })
    const snsClient = mockClient(SNSClient);
    snsClient.on(PublishBatchCommand).resolves({
        $metadata: {
            httpStatusCode: 200
        }

    })
    process.env.EVENT_SOURCE_TO_TRACK="ec2\.amazonaws\.com";
    process.env.EVENT_NAME_TO_TRACK="AttachVolume";
    process.env.TOPIC_ARN="TestTopic"
    return handler(incomingEvent,{} as any,undefined,s3Client as any,snsClient as any).then((value) => {

    })
},30000)