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

import {Context, EventBridgeEvent, SNSEvent} from "aws-lambda";
import {SendCommandCommand, SSMClient, StartAssociationsOnceCommand} from "@aws-sdk/client-ssm";
import {DescribeTagsCommand, EC2Client} from "@aws-sdk/client-ec2";

const TAG_VALUES_TO_MATCH = process.env.TAG_VALUES_TO_MATCH!.split(",")
export const handler = async (attachVolumeEvent: EventBridgeEvent<string, {[key: string]:any}>, context: Context, callback?: () => void, __ssmClient?: SSMClient, __ec2Client?: EC2Client): Promise<any> => {
    console.log(`Event: ${JSON.stringify(attachVolumeEvent)}`)

    const ssmClient = __ssmClient || new SSMClient({});
    const ec2Client = __ec2Client || new EC2Client({});
    try {


        const instanceId = attachVolumeEvent.detail["responseElements"]["instanceId"]
        console.debug(`Checking tags for instance ${instanceId}`)
        const describeTagsResponse = await ec2Client.send(new DescribeTagsCommand({
            Filters: [{
                Name: "resource-id",
                Values: [instanceId]
            }]
        }))
        const tags = describeTagsResponse.Tags?.filter(value => {
            return value.Key == process.env.TAG_KEY_TO_MATCH && value.Value != null && TAG_VALUES_TO_MATCH.indexOf(value.Value) != -1
        })
        console.debug(`Tags for instance ${instanceId}: ${JSON.stringify(tags)}`)
        if (tags != null && tags.length > 0) {
            const response = await ssmClient.send(new SendCommandCommand({
                InstanceIds: [instanceId],
                DocumentName: process.env.DOCUMENT_NAME
            }))
            console.info(`Command ${process.env.DOCUMENT_NAME} to instance ${instanceId} `)
        } else {
            console.info(`${instanceId} does not have tag ${process.env.TAG_KEY_TO_MATCH}:${process.env.TAG_VALUE_TO_MATCH}`)
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