/**
 * @author Rajeesh <rajeesh.k@iinerds.com>
 * @version: 0.5
 * @desc: Update the permission for API Gateway to execute the Lambda functions.
 * Generally in command line the following statement gets executed:
 * # aws lambda add-permission --function-name \
 *   arn:aws:lambda:{region}:902849442700:function:{lambda_name}:staging \
 *   --source-arn arn:aws:execute-api:us-east-2:902849442700:{api_id}/{resource}/GET/
 *   --principal apigateway.amazonaws.com --statement-id '4418dfb4-2ba9-488d-a03e-31860851a2e7 \
 *   --action lambda:InvokeFunction
 */

'use strict'

const jsonQuery = require('json-query');
var uuid = require('node-uuid');
var AWS = require('aws-sdk');

/**
 * Define AWS API version and intialize the AWS services objects.
 */

AWS.config.apiVersions = {
  /**
  * Not sure about the version info of the APIs! 
  * AWS maintains this way
  */  
  cloudformation: '2010-05-15', 
  codepipeline: '2015-07-09',
  apigateway: '2015-07-09',
  lambda: '2015-03-31'
};

var cloudformation = new AWS.CloudFormation();
var codepipeline = new AWS.CodePipeline();
var apigateway = new AWS.APIGateway();
var lambda = new AWS.Lambda();

// Define the REST method here.
var restMethod = 'GET';

// REST Api id of the deployed API.
var restApiIdVal, functionArn = '';
var apiArn = 'arn:aws:execute-api:us-east-2:902849442700:';

// Lambda handler starts here.
exports.handler = function(event, context, callback) {

    //Retrieve the CodePipeline ID 
    var jobId = event["CodePipeline.job"].id;

    /**
     * Retrieve the value of UserParameters from the Lambda action configuration in AWS CodePipeline, in this case a URL which will be
     * health checked by this function.
     */
    var stackName = event["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters; 

    // Define the CloudFormation stack parameters. The processed CF template need to be used.     
    var stackParams = {
        StackName: stackName,
        TemplateStage: 'Processed'
    };

    

    // Define the Success function.
    var putJobSuccess = function(message) {
      
       /** 
        * CodePipeline pararmeters.
        */
        var cpParams = {
            jobId: jobId
        };

        /**
         * CodePipeline JobSuccess method as required by CodePipeline.
         */
        codepipeline.putJobSuccessResult(cpParams, function(err, data) {
            if (err) {
                callback(err);
            }
            else {
                /**
                 * Get the CF Processed template for getting the API and Function name.
                 */
                cloudformation.getTemplate(stackParams, function(err, data) {
                    if (err) { 
                        callback(err);
                    }
                    else {
                        /**
                         * Processed Template body.
                         */
                        var templateBody = data.TemplateBody;
                        var jsonTemplate = JSON.parse(templateBody);

                        /**
                         * Retreive the API Name, as defined in the SAM template, which is extracted here.
                         */ 
                        var restApiName = jsonTemplate.Resources.CCTApi.Properties.Name;
                        var functionName = jsonTemplate.Resources.CCTFunction.Properties.FunctionName;
                        
                        /**
                         * Function ARN.
                         */
                        functionArn +=  functionName;

                        /**
                         *  Define the API List parameters.
                         */ 
                        var apiListParams = {
                            limit: 20,   
                        };
                        
                        /**
                         * Retrieve All the API and then pass the Rest API Id to retrieve the correct API.
                         */
                        apigateway.getRestApis(apiListParams, function(err, data) {
                            if (err) {
                            }    
                            else {
                                /**
                                 * REST API Id. AWS keeps its own format.
                                 */
                                var currentApiData = jsonQuery('items[name=' + restApiName+ '].id', {
                                    data: data
                                }) 

                                restApiIdVal = currentApiData.value; // REST API Id.
                                
                                /**
                                 * This is again an hardcoded value to make the API Arn. Need to change
                                 * it based on the changes in resources. The '*' may get changed based on 
                                 * the RESOURCES defined and also the method name.
                                 */
                                apiArn += restApiIdVal + '/*/' + restMethod + '/';
                                
                                var apiParams = {
                                    restApiId: restApiIdVal /* required */
                                };
                                
                                /**
                                 * Define the Permission parameters.
                                
                                 * Please make a note of the FunctionName and SourceArn.
                                 */
                                var addPermParams = {
                                    Action: "lambda:InvokeFunction", 
                                    FunctionName: functionArn, 
                                    Principal: "apigateway.amazonaws.com", 
                                    SourceArn: apiArn, 
                                    Qualifier: '',
                                    StatementId: uuid.v4() // Geenrate an unique value.
                                };

                                /**
                                 * Retrieve all the stages of the API.
                                 */    
                                apigateway.getStages(apiParams, function(err, data) {
                                    if (err) console.log(err, err.stack); // an error occurred
                                    else     
                                    
                                    /**
                                     * All stages.
                                     */
                                    var apiStages = jsonQuery('item[*].stageName', {
                                        data: data
                                    })  

                                    apiStages = apiStages.value; // Stage value.

                                    /**
                                     *  All stages has to get th permission; so loop through. 
                                     */
                                    for (var stageIndex = 0; stageIndex < apiStages.length; stageIndex++) {
                                        var stageName = apiStages[stageIndex];
                                        /**
                                         * The ALIAS for which the the permission is applicable.
                                         * Currently, it is only for "staging"  and "prod" alias.
                                         */
                                        addPermParams['Qualifier'] = stageName; 
                                        lambda.addPermission(addPermParams, function(err, data) { // Get it.
                                            if (err) console.log(err, err.stack); // an error occurred
                                            else     console.log(data);           // successful response
                                        });
                                    }
                                  });
                            }    
                        });
                    }
                });
                callback(null, message); // I am done.
            }    
        });    
    }    

   /**
    *  Notify AWS CodePipeline of a failed job
    */
   var putJobFailure = function(message) {

    /**
     * Fail parameters. Nothing much relevant here. A copy & paste stuff.
     */
    var failParams = {
        jobId: jobId,
        failureDetails: {
            message: JSON.stringify(message),
            type: 'JobFailed',
            externalExecutionId: context.invokeid
        }
    };
    /**
     * Call the failure action.
     */
    codepipeline.putJobFailureResult(failParams, function(err, data) {
        context.fail(message);      
    });
};

    // Break unless the StackName is given.
    if(!stackName) {
        putJobFailure('The UserParameters field must contain the Stack Name!');  
        return;
    }

    putJobSuccess('Success'); // Get the stuff done here.

};