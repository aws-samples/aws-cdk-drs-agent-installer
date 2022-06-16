/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {Aws, Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as path from "path";
import {Architecture, Runtime} from "aws-cdk-lib/aws-lambda";
import {RetentionDays} from "aws-cdk-lib/aws-logs";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {CloudTrailEventNotifier} from "../constructs/CloudTrailEventNotifier";
import {SnsEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {Queue, QueueEncryption} from "aws-cdk-lib/aws-sqs";
import {AnyPrincipal, Effect, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {NagSuppressions} from "cdk-nag";

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
            removalPolicy: RemovalPolicy.DESTROY,
            encryption: QueueEncryption.KMS_MANAGED,


        })

        dlq.addToResourcePolicy(new PolicyStatement({
            sid:"Enforce TLS for all principals",
            effect: Effect.DENY,
            principals:[new AnyPrincipal()],
            actions: ["sqs:*"],
            conditions: {
                "Bool": {"aws:SecureTransport": "false"},
            }
        }))
        eventHandler.addEventSource(new SnsEventSource(cloudTrailEventNotifier.topic,{
            deadLetterQueue: dlq
        }))
        //cdk nag suppressions
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/cloud-trail-events-notifier/cloud-trail-bucket/Resource", [{
            id: "AwsSolutions-S1",
            reason: "No need for access logs on this bucket"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/cloud-trail-events-notifier/notifier-function/ServiceRole/Resource", [{
            id: "AwsSolutions-IAM4",
            reason: "I'm ok using a managed policy here"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/cloud-trail-events-notifier/notifier-function/ServiceRole/DefaultPolicy/Resource", [{
            id: "AwsSolutions-IAM5",
            reason: "I'm ok using wildcard permissions here"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource", [{
            id: "AwsSolutions-IAM4",
            reason: "I'm ok using a managed policy here"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/DefaultPolicy/Resource", [{
            id: "AwsSolutions-IAM5",
            reason: "I'm ok using wildcard permissions here"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role/Resource", [{
            id: "AwsSolutions-IAM4",
            reason: "I'm ok using a managed policy here"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/BucketNotificationsHandler050a0587b7544547bf325f094a3db834/Role/DefaultPolicy/Resource", [{
            id: "AwsSolutions-IAM5",
            reason: "I'm ok using wildcard permissions here"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/on-volume-attach-event-handler/ServiceRole/Resource", [{
            id: "AwsSolutions-IAM4",
            reason: "I'm ok using a managed policy here"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/on-volume-attach-event-handler/ServiceRole/DefaultPolicy/Resource", [{
            id: "AwsSolutions-IAM5",
            reason: "I'm ok using wildcard permissions here"
        }])
        NagSuppressions.addResourceSuppressionsByPath(this, "/on-attach-volume-event/on-volume-attach-event-dlq/Resource", [{
            id: "AwsSolutions-SQS3",
            reason: "This is a DLQ"
        }])

    }
}
