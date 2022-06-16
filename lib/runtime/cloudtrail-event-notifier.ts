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

import {Context, S3Event} from "aws-lambda";
import {GetObjectCommand, S3Client} from "@aws-sdk/client-s3";
import * as zlib from "zlib";
import {Readable} from "stream";
import {PublishBatchCommand, SNSClient, PublishBatchRequestEntry} from "@aws-sdk/client-sns";


export const handler = async (event: S3Event, context: Context,callback?:()=>void, __s3Client?: S3Client ,__snsClient?:SNSClient): Promise<any> => {
    console.log(`Event: ${JSON.stringify(event)}`)
    const srcBucket = event.Records[0].s3.bucket.name;
    const srcKey = event.Records[0].s3.object.key;
    const eventSourceToTrack = new RegExp(process.env.EVENT_SOURCE_TO_TRACK!)
    const eventNameToTrack = new RegExp(process.env.EVENT_NAME_TO_TRACK!)
    let s3Client:S3Client=__s3Client || new S3Client({})
    let snsClient:SNSClient=__snsClient || new SNSClient({})
    try {
        for (let r of event.Records) {
            const s3Response = await s3Client.send(new GetObjectCommand({
                Bucket: srcBucket,
                Key: srcKey
            }))

            const stream = await new Promise<Buffer>((resolve, reject) => {
                if (!s3Response.Body) {
                    reject("No Body on response.");
                } else {
                    const chunks: Uint8Array[] = [];
                    const bodyStream = s3Response.Body! as Readable;
                    bodyStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
                    bodyStream.on("end", () =>
                        resolve(Buffer.concat(chunks))
                    );
                }
            });
            const events=await new Promise<Object[]|undefined>((resolve, reject) => {

                zlib.gunzip(stream, (error, jsonBuffer) => {
                    var json = jsonBuffer.toString();
                    console.log('CloudTrail JSON from S3:', json);
                    var records;
                    try {
                        records = JSON.parse(json);
                    } catch (err) {
                        reject(new Error('Unable to parse CloudTrail JSON: ' + err));

                    }
                    const matchingRecords = records.Records.filter((value: { eventSource: string; eventName: string; }) => {
                        const eventSource: string = value.eventSource
                        const eventName: string = value.eventName
                        return eventSource.match(eventSourceToTrack) != null && eventName.match(eventNameToTrack) != null
                    })
                    resolve(matchingRecords)

                })
            })

            if(events!=null && events.length>0){

                const entries=events.map(value => {
                    return {
                        // @ts-ignore
                        Id: value.eventID,
                        Message: JSON.stringify(value)
                    } as PublishBatchRequestEntry
                })
                console.log(`Found ${JSON.stringify(entries)}`)
                await snsClient.send(new PublishBatchCommand({
                    TopicArn: process.env.TOPIC_ARN,
                    PublishBatchRequestEntries: entries
                }))
            }else{
                console.log(`No match events found at this time`)
            }
        }

        return {
            status: "Success"
        }
    } catch (e) {
        const error: Error = e as Error
        console.log(`Error: ${error}`)
        return {
            status: "Failed",
            msg: `${error.name} - ${error.message}`
        }
    }
}

