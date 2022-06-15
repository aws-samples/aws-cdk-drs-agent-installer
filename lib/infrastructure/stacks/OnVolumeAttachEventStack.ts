import {Aws, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as path from "path";
import {Architecture, Runtime} from "aws-cdk-lib/aws-lambda";
import {RetentionDays} from "aws-cdk-lib/aws-logs";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {CloudTrailEventNotifier} from "../constructs/CloudTrailEventNotifier";
import {SnsEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {Queue} from "aws-cdk-lib/aws-sqs";
import {Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";

export interface CloudTrailEventLambdaStackConfig extends StackProps{
    cloudTrailBucketArn:string|undefined
    trailName:string|undefined,
    documentName:string
    tagKeyToMatch:string,
    tagValuesToMatch:string[]

}

export class OnVolumeAttachEventStack extends Stack {
    constructor(scope: Construct, id: string, props: CloudTrailEventLambdaStackConfig) {
        super(scope, id, props);

        const cloudTrailEventNotifier=new CloudTrailEventNotifier(this,"cloud-trail-events-notifier",{
            eventSourceToTrack:"ec2\.amazonaws\.com",
            eventNameToTrack:"AttachVolume",
            cloudTrailBucketArn: props.cloudTrailBucketArn,
            trailName: props.trailName
        })
        const eventHandler=new NodejsFunction(this, "on-volume-attach-event-handler", {
            memorySize: 256,
            architecture: Architecture.ARM_64,
            timeout: Duration.seconds(30),
            runtime: Runtime.NODEJS_16_X,
            handler: "handler",
            entry: path.join(__dirname, "/../../runtime/on-volume-attach-event.ts"),
            logRetention: RetentionDays.FIVE_DAYS,
            environment: {
                DOCUMENT_NAME: props.documentName,
                TAG_KEY_TO_MATCH: props.tagKeyToMatch,
                TAG_VALUES_TO_MATCH: props.tagValuesToMatch.join(",")
            }

        });
        eventHandler.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: ["ssm:SendCommand"],
            effect: Effect.ALLOW,
            resources: [`arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:document/${props.documentName}`,`arn:${Aws.PARTITION}:ec2:${Aws.REGION}:${Aws.ACCOUNT_ID}:instance/*`]
        }))
        eventHandler.grantPrincipal.addToPrincipalPolicy(new PolicyStatement({
            actions: ["ec2:DescribeTags"],
            effect: Effect.ALLOW,
            resources: ["*"]
        }))
        const dlq=new Queue(this,"on-volume-attach-event-dlq",{
            queueName: "on-volume-attach-event-dlq",
            removalPolicy: RemovalPolicy.DESTROY
        })
        eventHandler.addEventSource(new SnsEventSource(cloudTrailEventNotifier.topic,{
            deadLetterQueue: dlq
        }))


    }
}
