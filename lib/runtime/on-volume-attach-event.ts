import {Context, SNSEvent} from "aws-lambda";
import {SendCommandCommand, SSMClient, StartAssociationsOnceCommand} from "@aws-sdk/client-ssm";
import {DescribeTagsCommand, EC2Client} from "@aws-sdk/client-ec2";

const TAG_VALUES_TO_MATCH=process.env.TAG_VALUES_TO_MATCH!.split(",")
export const handler = async (event: SNSEvent,context:Context,callback?:()=>void,__ssmClient?:SSMClient,__ec2Client?:EC2Client): Promise<any> => {
    console.log(`Event: ${JSON.stringify(event)}`)

    const ssmClient = __ssmClient || new SSMClient({  });
    const ec2Client = __ec2Client || new EC2Client({  });
    try {

        for (let snsRecord of event.Records){
            const attachVolumeEvent=JSON.parse(snsRecord.Sns.Message)
            const instanceId=attachVolumeEvent.responseElements.instanceId
            console.debug(`Checking tags for instance ${instanceId}`)
            const describeTagsResponse=await ec2Client.send(new DescribeTagsCommand({
                Filters:[{
                    Name: "resource-id",
                    Values:[instanceId]

                }]
            }))
            const tags=describeTagsResponse.Tags?.filter(value => {
                return value.Key==process.env.TAG_KEY_TO_MATCH && value.Value!=null && TAG_VALUES_TO_MATCH.indexOf(value.Value)!=-1
            })
            console.debug(`Tags for instance ${instanceId}: ${JSON.stringify(tags)}`)
            if(tags!=null && tags.length>0){
                const response=await ssmClient.send(new SendCommandCommand({
                    InstanceIds: [instanceId],
                    DocumentName: process.env.DOCUMENT_NAME
                }))
            }else{
                console.info(`${instanceId} does not have tag ${process.env.TAG_KEY_TO_MATCH}:${process.env.TAG_VALUE_TO_MATCH}`)
            }
        }


        return {
            status:"Success"
        }
    }
    catch (e) {
        const error:Error = e as Error
        console.log(`Error: ${error}`)
        return {
            status:"Failed",
            msg: `${error.name} - ${error.message}`
        }
    }
}