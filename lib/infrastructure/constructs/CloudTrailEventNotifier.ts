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

import {Construct} from "constructs";
import {BlockPublicAccess, Bucket, BucketEncryption, EventType} from "aws-cdk-lib/aws-s3";
import {ITopic, Topic} from "aws-cdk-lib/aws-sns";
import {LambdaDestination} from "aws-cdk-lib/aws-s3-notifications";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "path";
import {Architecture, IFunction, Runtime} from "aws-cdk-lib/aws-lambda";
import {Aws, Duration, RemovalPolicy} from "aws-cdk-lib";
import {RetentionDays} from "aws-cdk-lib/aws-logs";
import {Trail} from "aws-cdk-lib/aws-cloudtrail";
import {Key} from "aws-cdk-lib/aws-kms";

export interface CloudTrailEventConfig{
    cloudTrailBucketArn:string|undefined
    trailName:string|undefined
    eventSourceToTrack:string
    eventNameToTrack:string
}
export class CloudTrailEventNotifier extends Construct{
    readonly fn:IFunction
    readonly topic:ITopic
    constructor(scope: Construct, id: string,config:CloudTrailEventConfig) {
        super(scope, id);
        let cloudTrailBucket
        if(config.trailName!=null){
            cloudTrailBucket = new Bucket(this, "cloud-trail-bucket", {
                bucketName: `${config.trailName}-bucket-${Aws.ACCOUNT_ID}-${Aws.REGION}`,
                removalPolicy: RemovalPolicy.DESTROY,
                autoDeleteObjects: true,
                blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
                encryption: BucketEncryption.S3_MANAGED,
                enforceSSL: true
            })
            const trail=new Trail(this,"attach-volume-trail",{
                trailName: config.trailName,
                bucket: cloudTrailBucket,
                isMultiRegionTrail: false,
            })
            trail.applyRemovalPolicy(RemovalPolicy.DESTROY)
        }else if(config.cloudTrailBucketArn!=null) {
            cloudTrailBucket = Bucket.fromBucketArn(this, "cloud-trail-bucket", config.cloudTrailBucketArn)
        }else{
            throw new Error("You must specify either ARN of the bucket where cloudtrail logs are written or the name of a new CloudTrail which will be created")
        }
        const topicKey=new Key(this,"topic-key",{
            removalPolicy: RemovalPolicy.DESTROY,
            enableKeyRotation: true
        })
        this.topic=new Topic(this,"cloud-trail-events-topic",{
            displayName: "cloud-trail-events-topic",
            topicName: "cloud-trail-events-topic",
            masterKey: topicKey

        })

        this.fn = new NodejsFunction(this, "notifier-function", {
            memorySize: 256,
            architecture: Architecture.ARM_64,
            timeout: Duration.seconds(30),
            runtime: Runtime.NODEJS_16_X,
            handler: "handler",
            entry: path.join(__dirname, "/../../runtime/cloudtrail-event-notifier.ts"),
            logRetention: RetentionDays.FIVE_DAYS,
            environment:{
                EVENT_SOURCE_TO_TRACK: config.eventSourceToTrack,
                EVENT_NAME_TO_TRACK: config.eventNameToTrack,
                TOPIC_ARN: this.topic.topicArn

            }

        });

        cloudTrailBucket.grantRead(this.fn)
        cloudTrailBucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(this.fn),{prefix: `AWSLogs/${Aws.ACCOUNT_ID}/CloudTrail/${Aws.REGION}`})
        this.topic.grantPublish(this.fn)



    }

}